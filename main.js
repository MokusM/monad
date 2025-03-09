const prompts = require('prompts');
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('./config');
const walletUtils = require('./utils/wallet-utils');

// Функція для перевірки балансу гаманця
async function checkWalletBalance(privateKey, proxy) {
    try {
        const provider = new ethers.providers.JsonRpcProvider({
            url: config.RPC_URL,
            headers: {
                'Proxy-Authorization': `Basic ${Buffer.from(
                    proxy.split('@')[0]
                ).toString('base64')}`,
            },
        });

        const wallet = new ethers.Wallet(privateKey, provider);
        const balance = await wallet.getBalance();
        
        return {
            wallet,
            provider,
            address: wallet.address,
            balance,
            hasEnoughBalance: balance.gte(ethers.utils.parseEther(config.MIN_BALANCE))
        };
    } catch (error) {
        console.error(`Error checking wallet balance: ${error.message}`.red);
        return {
            address: 'Unknown',
            balance: ethers.BigNumber.from(0),
            hasEnoughBalance: false
        };
    }
}

// Функція для запуску модулів у випадковому порядку
async function runModulesInRandomOrder(wallet, provider, proxy) {
    // Масив модулів
    const modules = [
        { name: 'Rubic Swap', run: async () => await require('./scripts/rubic-multi').runSwap(wallet) },
        { name: 'Magma Staking', run: async () => await require('./scripts/magma-multi').runStaking(wallet) },
        { name: 'Izumi Swap', run: async () => await require('./scripts/izumi-multi').runSwap(wallet) },
        { name: 'aPriori Staking', run: async () => await require('./scripts/apriori-multi').runStaking(wallet) }
    ];

    // Перемішуємо масив модулів
    const selectedModules = walletUtils.shuffleArray([...modules]);
    
    // Вибираємо випадкову кількість модулів (1-3)
    const numModules = Math.floor(Math.random() * 3) + 1;
    const modulesToRun = selectedModules.slice(0, numModules);

    console.log(`\n${colors.cyan(`Починаємо операції для гаманця ${walletUtils.formatAddress(wallet.address)} через проксі ${proxy.split('@')[1] || proxy}`)}`);
    console.log(`${colors.green(`Баланс гаманця: ${walletUtils.formatNumber(ethers.utils.formatEther(await wallet.getBalance()))} MON`)}`);
    console.log(`${colors.yellow(`Запускаємо ${numModules} випадкових модулів: ${modulesToRun.map(m => m.name).join(' → ')}`)}`);

    // Запускаємо вибрані модулі по черзі
    for (const module of modulesToRun) {
        console.log(`\n${colors.magenta(`Запускаємо ${module.name}...`)}`);
        await module.run();
        console.log(`${colors.green(`${module.name} завершено`)}`);
        
        // Додаємо випадкову затримку між модулями
        if (modulesToRun.indexOf(module) < modulesToRun.length - 1) {
            const delay = Math.floor(Math.random() * (config.DELAYS.MAX_DELAY - config.DELAYS.MIN_DELAY) * 1000) + config.DELAYS.MIN_DELAY * 1000;
            console.log(`${colors.yellow(`Очікуємо ${Math.round(delay / 1000)} секунд перед наступним модулем...`)}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Головна функція
async function main() {
    console.log(colors.bold.green('=== ЗАПУСК МОДУЛІВ ДЛЯ ВСІХ ГАМАНЦІВ ==='));
    const date = new Date();
    console.log(`Дата та час: ${date.toLocaleDateString()}, ${date.toLocaleTimeString()}`);
    console.log(`Мінімальний баланс: ${config.MIN_BALANCE} MON`);
    console.log(`RPC URL: ${config.RPC_URL}`);
    
    // Отримуємо гаманці (можливо перемішані)
    const { wallets, proxies } = walletUtils.getWallets(config);
    
    if (wallets.length === 0) {
        console.log('❌ Не знайдено жодного гаманця в конфігурації'.red);
        return;
    }
    
    console.log(`\n⏳ Перевіряємо стан ${wallets.length} гаманців...`);
    
    const walletResults = [];
    const walletKeyMap = {}; // Для зберігання відповідності між адресою та приватним ключем
    
    // Перевіряємо баланси всіх гаманців
    for (let i = 0; i < wallets.length; i++) {
        const privateKey = wallets[i];
        const proxy = proxies[i % proxies.length];
        
        const result = await checkWalletBalance(privateKey, proxy);
        walletResults.push({ ...result, privateKey, proxy });
        
        // Зберігаємо відповідність між адресою і приватним ключем
        walletKeyMap[result.address] = privateKey;
        
        console.log(`Гаманець ${walletUtils.formatAddress(result.address)}: ${walletUtils.formatNumber(ethers.utils.formatEther(result.balance))} MON - ${result.hasEnoughBalance ? 'ДОСТАТНЬО'.green : 'НЕДОСТАТНЬО'.red}`);
        
        // Додаємо випадкову затримку, якщо потрібно
        if (config.PRIVACY && config.PRIVACY.RANDOM_DELAYS && i < wallets.length - 1) {
            await walletUtils.randomDelay(300, 1000);
        }
    }

    // Фільтруємо гаманці з достатнім балансом
    const validWallets = walletResults.filter(w => w.hasEnoughBalance);
    
    console.log(`\n${colors.yellow(`Знайдено ${validWallets.length} з ${wallets.length} гаманців з достатнім балансом`)}`);
    
    if (validWallets.length === 0) {
        console.log('❌ Немає гаманців з достатнім балансом. Завершення...'.red);
        return;
    }

    // Запитуємо користувача, чи продовжувати
    const response = await prompts({
        type: 'confirm',
        name: 'continue',
        message: `Продовжити роботу з ${validWallets.length} гаманцями?`,
        initial: true
    });

    if (!response.continue) {
        console.log('🛑 Операцію скасовано користувачем. Завершення...'.yellow);
        return;
    }

    // Запитуємо про додаткове перемішування
    let shuffledValidWallets = [...validWallets];
    if (config.PRIVACY && config.PRIVACY.SHUFFLE_WALLETS) {
        const shuffleResponse = await prompts({
            type: 'confirm',
            name: 'shuffle',
            message: 'Перемішати порядок гаманців ще раз перед виконанням?',
            initial: true
        });

        if (shuffleResponse.shuffle) {
            shuffledValidWallets = walletUtils.shuffleArray(validWallets);
            console.log(`🔀 ${colors.cyan('Порядок гаманців перемішано додатково')}`);
        }
    }

    // Запускаємо модулі для кожного гаманця з достатнім балансом
    for (const walletData of shuffledValidWallets) {
        await runModulesInRandomOrder(walletData.wallet, walletData.provider, walletData.proxy);
        
        // Додаємо випадкову затримку між гаманцями
        if (shuffledValidWallets.indexOf(walletData) < shuffledValidWallets.length - 1) {
            const delay = Math.floor(Math.random() * (config.DELAYS.MAX_DELAY - config.DELAYS.MIN_DELAY) * 1000) + config.DELAYS.MIN_DELAY * 1000;
            console.log(`\n${colors.yellow(`Очікуємо ${Math.round(delay / 1000)} секунд перед наступним гаманцем...`)}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    console.log(`\n${colors.bold.green('Всі операції успішно завершено!')}`);
}

main().catch((error) => {
    console.error('Виникла помилка:', error);
});
