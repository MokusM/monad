/**
 * Скрипт для перевірки працездатності проксі-серверів
 * Перевіряє з'єднання з блокчейном Monad через кожен налаштований проксі-сервер
 */

const { ethers } = require('ethers');
const colors = require('colors');
const config = require('./config');
const walletUtils = require('./utils/wallet-utils');

// Асинхронна функція сну
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Функція для перевірки проксі
async function checkProxy(proxy, index) {
    console.log(`\n${colors.yellow(`=== Перевірка проксі #${index + 1}: ${formatProxyUrl(proxy)} ===`)}`);
    
    try {
        // Створюємо провайдер з проксі
        const provider = new ethers.providers.JsonRpcProvider({
            url: config.RPC_URL,
            headers: {
                'Proxy-Authorization': `Basic ${Buffer.from(
                    proxy.split('@')[0]
                ).toString('base64')}`,
            },
        });

        // Вимірюємо час виконання запиту
        const startTime = Date.now();
        
        // Виконуємо найпростіший запит - отримання номера блоку
        console.log(`🔄 Підключення до ${config.RPC_URL} через проксі...`);
        const blockNumber = await provider.getBlockNumber();
        
        // Рахуємо час відповіді
        const responseTime = Date.now() - startTime;
        
        console.log(`✅ ${colors.green('Проксі працює!')} Час відповіді: ${responseTime}ms`);
        console.log(`🧊 Поточний блок: ${colors.cyan(blockNumber)}`);
        
        // Додаткова перевірка газу для упевненості
        const gasPrice = await provider.getGasPrice();
        const gasPriceGwei = parseFloat(ethers.utils.formatUnits(gasPrice, "gwei")).toFixed(1);
        console.log(`⛽ Поточна ціна газу: ${colors.cyan(gasPriceGwei)} Gwei`);
        
        return {
            proxy,
            index,
            status: 'OK',
            responseTime,
            blockNumber,
            gasPrice: gasPriceGwei
        };
    } catch (error) {
        console.log(`❌ ${colors.red("Помилка підключення:")} ${error.message}`);
        return {
            proxy,
            index,
            status: 'ПОМИЛКА',
            error: error.message
        };
    }
}

// Форматування URL проксі для відображення
function formatProxyUrl(proxy) {
    try {
        // Перевіряємо, чи містить URL логін/пароль
        if (proxy.includes('@')) {
            // Замінюємо логін:пароль на ***
            const [auth, host] = proxy.split('@');
            
            // Знаходимо початок логіну після http:// або https://
            const protocolEnd = auth.indexOf('://') + 3;
            const protocol = auth.substring(0, protocolEnd);
            const credentials = '***:***';
            
            return `${protocol}${credentials}@${host}`;
        } else {
            return proxy;
        }
    } catch (e) {
        return proxy;
    }
}

// Головна функція
async function main() {
    console.log(colors.bold.green('=== ПЕРЕВІРКА ПРОКСІ-СЕРВЕРІВ ==='));
    const date = new Date();
    console.log(`Дата та час: ${date.toLocaleDateString()}, ${date.toLocaleTimeString()}`);
    console.log(`RPC URL: ${config.RPC_URL}`);
    
    // Отримуємо список проксі з конфігурації
    const proxies = config.PROXIES || [];
    
    if (proxies.length === 0) {
        console.log(colors.red('\n❌ У конфігурації не знайдено жодного проксі-сервера'));
        return;
    }
    
    console.log(`\n⏳ Перевіряємо ${proxies.length} проксі-серверів...`);
    
    // Результати перевірки
    const results = [];
    
    // Перевіряємо кожен проксі
    for (let i = 0; i < proxies.length; i++) {
        const result = await checkProxy(proxies[i], i);
        results.push(result);
        
        // Невеличка затримка між перевірками, щоб не перевантажувати мережу
        if (i < proxies.length - 1) {
            await sleep(500);
        }
    }
    
    // Виводимо підсумкову статистику
    console.log(colors.bold.green('\n=== РЕЗУЛЬТАТИ ПЕРЕВІРКИ ПРОКСІ ==='));
    
    // Таблиця з результатами
    console.log('+---------+-------------------------------------+-------------+---------------+');
    console.log('| ' + colors.cyan('№') + '       | ' + colors.cyan('Проксі') + '                              | ' + colors.cyan('Статус') + '     | ' + colors.cyan('Час (ms)') + '     |');
    console.log('+---------+-------------------------------------+-------------+---------------+');
    
    results.forEach(result => {
        const statusColor = result.status === 'OK' ? colors.green : colors.red;
        console.log(
            `| ${colors.yellow(String(result.index + 1).padEnd(7))} | ` +
            `${formatProxyUrl(result.proxy).padEnd(35)} | ` +
            `${statusColor(result.status.padEnd(11))} | ` +
            `${result.responseTime ? String(result.responseTime).padEnd(13) : 'N/A'.padEnd(13)} |`
        );
    });
    
    console.log('+---------+-------------------------------------+-------------+---------------+');
    
    // Підсумок
    const workingProxies = results.filter(r => r.status === 'OK').length;
    console.log(`\n✅ Працюючих проксі: ${colors.green(workingProxies)} з ${results.length}`);
    
    if (workingProxies === 0) {
        console.log(colors.red('\n❌ УВАГА! Жоден проксі не працює! Перевірте налаштування або інтернет-звязання.'));
    } else if (workingProxies < results.length) {
        console.log(colors.yellow(`\n⚠️ ${results.length - workingProxies} проксі не працюють. Рекомендуємо оновити конфігурацію.`));
    } else {
        console.log(colors.green('\n✅ Всі проксі-сервери працюють коректно!'));
    }
}

// Запускаємо головну функцію
main().catch(error => {
    console.error(colors.red(`\n❌ Сталася помилка: ${error.message}`));
    process.exit(1);
}); 