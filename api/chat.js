import crypto from 'crypto';

 

// Отключаем строгую проверку сертификатов Минцифры для Vercel

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

 

// Ссылка на ваш Google Apps Script из Шага 2 (заканчивается на /exec)

const GOOGLE_DRIVE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzxTUQwsKxdgF2wnrpUmoJl--jWaGx9QUlSwtytIXFIjKmob_TitUzKBFyNrLxRs7Ob/exec";

 

// Кэш для базы знаний, чтобы не опрашивать Google Диск при каждом клике (хранится 10 минут)

let cachedKnowledge = "";

let lastFetchTime = 0;

 

async function getKnowledgeFromDrive() {

  const now = Date.now();

  // Если прошло меньше 10 минут с прошлого запроса — берем из памяти

  if (cachedKnowledge && (now - lastFetchTime < 10 * 60 * 1000)) {

    return cachedKnowledge;

  }

 

  try {

    const res = await fetch(GOOGLE_DRIVE_SCRIPT_URL);

    if (res.ok) {

      cachedKnowledge = await res.text();

      lastFetchTime = now;

      return cachedKnowledge;

    }

  } catch (e) {

    console.error("Ошибка загрузки базы из Google Drive:", e);

  }

  return cachedKnowledge || "База знаний временно недоступна.";

}

 

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

 

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

 

  const { message } = req.body || {};

  if (!message) return res.status(400).json({ error: 'Сообщение пустое' });

 

  const authKey = process.env.GIGACHAT_AUTH_KEY;

  if (!authKey) return res.status(500).json({ error: 'Ключ GigaChat не найден' });

 

  try {

    // 1. Получаем актуальный текст всех файлов с Google Диска

    const dynamicKnowledge = await getKnowledgeFromDrive();

 

    const systemPrompt = `

Ты — АСтра, интеллектуальный консультант по страховым продуктам компании «АльфаСтрахование» для клиентских менеджеров банка «Альфа-Банк».

 

Правила:

- Отвечай вежливо, четко и на русском языке.

- Формулируй ответ в интересах клиента («Клиенту нужно...», «Для клиента доступно...»).

- Используй списки и выделение жирным шрифтом.

- Отвечай ИСКЛЮЧИТЕЛЬНО на основе базы знаний ниже. Если информации нет, прямо скажи: «К сожалению, в базе знаний нет данных по этому вопросу. Уточните информацию у куратора».

 

=== АКТУАЛЬНАЯ БАЗА ЗНАНИЙ С GOOGLE ДИСКА ===

${dynamicKnowledge}

`;

 

    // 2. Авторизация в GigaChat

    const tokenRes = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {

      method: 'POST',

      headers: {

        'Content-Type': 'application/x-www-form-urlencoded',

        'Accept': 'application/json',

        'RqUID': crypto.randomUUID(),

        'Authorization': `Basic ${authKey}`

      },

      body: 'scope=GIGACHAT_API_PERS'

    });

 

    const tokenData = await tokenRes.json();

    const accessToken = tokenData.access_token;

 

    // 3. Запрос к нейросети

    const chatRes = await fetch('https://gigachat.devices.sberbank.ru/api/v1/chat/completions', {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

       'Accept': 'application/json',

        'Authorization': `Bearer ${accessToken}`

      },

      body: JSON.stringify({

        model: 'GigaChat',

        messages: [

          { role: 'system', content: systemPrompt },

          { role: 'user', content: message }

        ],

        temperature: 0.2

      })

    });

 

    const chatData = await chatRes.json();

    const reply = chatData.choices?.[0]?.message?.content || 'Не удалось сформировать ответ.';

 

    return res.status(200).json({ reply });

  } catch (error) {

    return res.status(500).json({ error: 'Ошибка: ' + error.message });

  }

}
