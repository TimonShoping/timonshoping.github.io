export default async function handler(req, res) {
    // Снимаем блокировки браузеров
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не разрешен' });

    try {
        const { productName, price, steamInput } = req.body;

        if (!productName || !price || !steamInput) {
            return res.status(400).json({ error: 'Пропущены обязательные параметры заказа' });
        }

        // 🔐 Забираем скрытые ключи из защищенной памяти сервера Vercel
        const shopId = process.env.YUKASSA_SHOP_ID;
        const apiKey = process.env.YUKASSA_SECRET_KEY; // Твой боевой ключ live_...

        if (!shopId || !apiKey) {
            return res.status(500).json({ error: 'Ошибка сервера: Ключи ЮKassa не настроены в Vercel' });
        }

        const orderComment = `Покупка: ${productName} | Steam: ${steamInput}`;
        const uniqueOrderId = "YOO_" + Date.now(); // Уникальный ID операции

        // Отправляем запрос ЮKassa на создание счета
        const response = await fetch('https://yookassa.ru', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(shopId + ':' + apiKey).toString('base64'),
                'Idempotence-Key': 'idem_' + uniqueOrderId, // Защита от двойных кликов
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: {
                    value: parseFloat(price).toFixed(2),
                    currency: 'RUB'
                },
                capture: true, // Списывать деньги сразу
                confirmation: {
                    type: 'redirect',
                    return_url: 'https://' + req.headers.host // Куда вернуть клиента после оплаты
                },
                description: orderComment,
                metadata: {
                    steam_profile: steamInput,
                    product: productName
                }
            })
        });

        const paymentData = await response.json();

        // Если ЮKassa создала платеж, отдаем сайту ссылку на оплату
        if (paymentData && paymentData.confirmation && paymentData.confirmation.confirmation_url) {
            return res.status(200).json({ url: paymentData.confirmation.confirmation_url });
        } else {
            return res.status(500).json({ error: paymentData.description || 'Ошибка генерации счета в ЮKassa API' });
        }

    } catch (error) {
        return res.status(500).json({ error: 'Внутренняя ошибка бэкенда Vercel' });
    }
}