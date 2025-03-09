const { ethers } = require('ethers');
const colors = require('colors');
const config = require('./config');

// Додаткові константи
const WMON_CONTRACT = '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';

// Функція для перевірки балансу гаманця
async function checkWalletBalance(privateKey, proxy, index) {
    try {
        // Створюємо провайдер з проксі
        const provider = new ethers.providers.JsonRpcProvider({
            url: config.RPC_URL,
            headers: proxy ? {
                'Proxy-Authorization': `Basic ${Buffer.from(
                    proxy.split('@')[0]
                ).toString('base64')}`,
            } : {},
        });

        // Створюємо інстанс гаманця
        const wallet = new ethers.Wallet(privateKey, provider);
        const address = wallet.address;
        
        console.log(`\n${colors.cyan('=')} Гаманець #${index + 1}: ${colors.yellow(address)} ${colors.cyan('=')}`);
        
        // Перевіряємо баланс MON
        const monBalance = await wallet.getBalance();
        console.log(`💰 ${colors.cyan('MON баланс:')} ${colors.green(formatNumber(monBalance))} MON`);
        
        // Перевіряємо баланс WMON з повторними спробами при помилці
        let wmonBalance = ethers.BigNumber.from(0);
        try {
            const wmonContract = new ethers.Contract(
                WMON_CONTRACT,
                ['function balanceOf(address owner) view returns (uint256)'],
                provider
            );
            
            wmonBalance = await wmonContract.balanceOf(address);
            console.log(`💰 ${colors.cyan('WMON баланс:')} ${colors.green(formatNumber(wmonBalance))} WMON`);
        } catch (error) {
            console.log(`💰 ${colors.cyan('WMON баланс:')} ${colors.yellow('Помилка запиту, намагаємось ще раз...')}`);
            try {
                // Спробуємо ще раз без проксі
                const fallbackProvider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
                const wmonContractFallback = new ethers.Contract(
                    WMON_CONTRACT,
                    ['function balanceOf(address owner) view returns (uint256)'],
                    fallbackProvider
                );
                
                wmonBalance = await wmonContractFallback.balanceOf(address);
                console.log(`💰 ${colors.cyan('WMON баланс:')} ${colors.green(formatNumber(wmonBalance))} WMON`);
            } catch (fallbackError) {
                console.log(`💰 ${colors.cyan('WMON баланс:')} ${colors.red('Невідомо')} (помилка запиту)`);
            }
        }
        
        // Отримуємо кількість транзакцій (nonce)
        const nonce = await provider.getTransactionCount(address);
        console.log(`🔢 ${colors.cyan('Кількість транзакцій (nonce):')} ${colors.yellow(nonce)}`);
        
        // Отримуємо кількість унікальних транзакцій
        const uniqueTxCount = await getUniqueTransactionsCount(address, provider);
        console.log(`📝 ${colors.cyan('Унікальних транзакцій:')} ${colors.yellow(uniqueTxCount)}`);
        
        // Отримуємо кількість NFT
        const nftCount = await getNFTCount(address, provider);
        console.log(`🖼️ ${colors.cyan('Кількість NFT:')} ${colors.yellow(nftCount)}`);
        
        // Перевіряємо газ у мережі
        try {
            const gasPrice = await provider.getGasPrice();
            console.log(`⛽ ${colors.cyan('Поточна ціна газу:')} ${colors.yellow(ethers.utils.formatUnits(gasPrice, 'gwei'))} Gwei`);
        } catch (error) {
            console.log(`⛽ ${colors.cyan('Поточна ціна газу:')} ${colors.red('Невідомо')}`);
        }
        
        // Розраховуємо загальний баланс (MON + WMON)
        const totalBalance = monBalance.add(wmonBalance);
        console.log(`💵 ${colors.cyan('Загальний баланс:')} ${colors.green(formatNumber(totalBalance))} (MON + WMON)`);
        
        // Визначаємо статус гаманця
        let status = 'OK';
        if (totalBalance.lt(ethers.utils.parseEther('0.01'))) {
            status = 'НЕДОСТАТНЬО';
        } else if (totalBalance.lt(ethers.utils.parseEther(config.MIN_BALANCE))) {
            status = 'НИЗЬКИЙ';
        }
        
        return {
            index,
            address,
            monBalance,
            wmonBalance,
            totalBalance,
            nonce,
            uniqueTxCount,
            nftCount,
            hasEnoughBalance: totalBalance.gte(ethers.utils.parseEther(config.MIN_BALANCE)),
            status
        };
    } catch (error) {
        console.error(`❌ Помилка перевірки гаманця: ${error.message}`.red);
        return {
            index,
            address: 'Невідомо',
            monBalance: ethers.BigNumber.from(0),
            wmonBalance: ethers.BigNumber.from(0),
            totalBalance: ethers.BigNumber.from(0),
            nonce: 0,
            uniqueTxCount: 0,
            nftCount: 0,
            hasEnoughBalance: false,
            status: 'ПОМИЛКА'
        };
    }
}

// Функція для перемішування масиву (алгоритм Fisher-Yates shuffle)
function shuffleArray(array, seed = 'random') {
    const newArray = [...array]; // Створюємо копію масиву, щоб не змінювати оригінал
    
    // Створюємо простий генератор випадкових чисел на основі seed
    const randomGenerator = () => {
        if (seed === 'random') {
            return Math.random();
        } else {
            // Простий детермінований генератор на основі рядка seed
            let hash = 0;
            for (let i = 0; i < seed.length; i++) {
                hash = ((hash << 5) - hash) + seed.charCodeAt(i);
                hash |= 0; // Перетворюємо на 32-бітне ціле
            }
            
            // Поточний час для більшої випадковості, але якщо seed фіксований, 
            // то буде послідовність, що повторюється, а не завжди одна й та ж
            const currentTimestamp = Date.now(); 
            return Math.abs(Math.sin(hash + currentTimestamp)) % 1;
        }
    };
    
    // Алгоритм Fisher-Yates shuffle
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(randomGenerator() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    
    return newArray;
}

// Функція для отримання набору гаманців з перемішуванням, якщо потрібно
function getWallets() {
    const wallets = config.WALLETS || [];
    const proxies = config.PROXIES || [];
    
    if (wallets.length === 0) {
        console.log('❌ Не знайдено жодного гаманця в конфігурації'.red);
        return { wallets: [], proxies: [] };
    }
    
    // Перевіряємо, чи потрібно перемішувати гаманці
    if (config.PRIVACY && config.PRIVACY.SHUFFLE_WALLETS) {
        const seed = config.PRIVACY.SHUFFLE_SEED || 'random';
        console.log(`🔀 ${colors.cyan('Перемішуємо гаманці для підвищення приватності')} (${seed !== 'random' ? 'детерміновано' : 'випадково'})`);
        
        // Створюємо пари [гаманець, проксі] для збереження відповідності
        const pairs = wallets.map((wallet, index) => ({
            wallet,
            proxy: proxies[index % proxies.length]
        }));
        
        // Перемішуємо пари
        const shuffledPairs = shuffleArray(pairs, seed);
        
        // Розділяємо назад на масиви
        const shuffledWallets = shuffledPairs.map(pair => pair.wallet);
        const shuffledProxies = shuffledPairs.map(pair => pair.proxy);
        
        return { wallets: shuffledWallets, proxies: shuffledProxies };
    }
    
    return { wallets, proxies };
}

// Головна функція
async function main() {
    console.log(colors.bold.green('=== ПЕРЕВІРКА СТАНУ ГАМАНЦІВ ==='));
    const date = new Date();
    console.log(`Дата та час: ${date.toLocaleDateString()}, ${date.toLocaleTimeString()}`);
    console.log(`Мінімальний баланс: ${config.MIN_BALANCE} MON`);
    console.log(`RPC URL: ${config.RPC_URL}`);
    
    // Отримуємо гаманці (можливо перемішані)
    const { wallets, proxies } = getWallets();
    
    console.log(`\n⏳ Перевіряємо стан ${wallets.length} гаманців...`);
    
    // Перевіряємо баланси всіх гаманців
    const walletResults = [];
    for (let i = 0; i < wallets.length; i++) {
        const privateKey = wallets[i];
        const proxy = proxies[i % proxies.length];
        
        const result = await checkWalletBalance(privateKey, proxy, i);
        walletResults.push(result);
        
        // Додаємо випадкову затримку, якщо потрібно
        if (config.PRIVACY && config.PRIVACY.RANDOM_DELAYS && i < wallets.length - 1) {
            const delay = Math.floor(Math.random() * 2000) + 500; // 500-2500 мс
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // Підводимо підсумки
    const totalMON = walletResults.reduce((sum, wallet) => sum.add(wallet.monBalance), ethers.BigNumber.from(0));
    const totalWMON = walletResults.reduce((sum, wallet) => sum.add(wallet.wmonBalance), ethers.BigNumber.from(0));
    const totalBalance = walletResults.reduce((sum, wallet) => sum.add(wallet.totalBalance), ethers.BigNumber.from(0));
    const validWallets = walletResults.filter(w => w.hasEnoughBalance).length;
    
    console.log('\n' + colors.bold.green('=== ПІДСУМОК ==='));
    console.log(colors.cyan(`Загальна кількість гаманців: ${colors.yellow(wallets.length)}`));
    console.log(colors.cyan(`Гаманців з достатнім балансом: ${colors.yellow(validWallets)}`));
    console.log(colors.cyan(`Загальний баланс MON: ${colors.green(formatNumber(totalMON))} MON`));
    console.log(colors.cyan(`Загальний баланс WMON: ${colors.green(formatNumber(totalWMON))} WMON`));
    console.log(colors.cyan(`Загальний баланс (MON + WMON): ${colors.green(formatNumber(totalBalance))} MON`));
    
    // Таблиця з усіма гаманцями
    console.log('\n' + colors.bold.green('=== СТАТУС ГАМАНЦІВ ==='));
    console.log('+---------+--------------------------------------------+----------------+----------------+----------------+---------+--------+--------+----------+');
    console.log('| ' + colors.cyan('№') + '       | ' + colors.cyan('Адреса') + '                                  | ' + colors.cyan('MON') + '            | ' + colors.cyan('WMON') + '           | ' + colors.cyan('Всього') + '         | ' + colors.cyan('Nonce') + '   | ' + colors.cyan('Tx') + '    | ' + colors.cyan('NFT') + '    | ' + colors.cyan('Статус') + '   |');
    console.log('+---------+--------------------------------------------+----------------+----------------+----------------+---------+--------+--------+----------+');
    
    walletResults.forEach(wallet => {
        let statusColor;
        if (wallet.status === 'OK') {
            statusColor = colors.green;
        } else if (wallet.status === 'НИЗЬКИЙ') {
            statusColor = colors.yellow;
        } else {
            statusColor = colors.red;
        }
        
        console.log(
            `| ${colors.yellow(String(wallet.index + 1).padEnd(7))} | ` +
            `${wallet.address.padEnd(42)} | ` +
            `${formatNumber(wallet.monBalance).padEnd(14)} | ` +
            `${formatNumber(wallet.wmonBalance).padEnd(14)} | ` +
            `${formatNumber(wallet.totalBalance).padEnd(14)} | ` +
            `${String(wallet.nonce).padEnd(7)} | ` +
            `${String(wallet.uniqueTxCount || 0).padEnd(6)} | ` +
            `${String(wallet.nftCount || 0).padEnd(6)} | ` +
            `${statusColor(wallet.status.padEnd(8))} |`
        );
    });
    
    console.log('+---------+--------------------------------------------+----------------+----------------+----------------+---------+--------+--------+----------+');

    // Додаємо команди для користувача
    console.log('\n' + colors.bold.green('=== МОЖЛИВІ ДІЇ ==='));
    console.log(colors.cyan('1. Перевірити баланси:') + ' node check-wallets.js');
    console.log(colors.cyan('2. Запустити основний скрипт:') + ' node main.js');
    console.log(colors.cyan('3. Запустити конкретний модуль для всіх гаманців, наприклад:'));
    console.log('   - ' + colors.yellow('node scripts/rubic-multi.js') + ' (Rubic)');
    console.log('   - ' + colors.yellow('node scripts/magma-multi.js') + ' (Magma)');
    console.log('   - ' + colors.yellow('node scripts/izumi-multi.js') + ' (Izumi)');
    console.log('   - ' + colors.yellow('node scripts/apriori-multi.js') + ' (aPriori)');
}

// Функція для форматування числових значень (заокруглення)
function formatNumber(value, decimals = 4) {
    // Перевіряємо, чи є значення об'єктом BigNumber
    if (typeof value === 'object' && value._isBigNumber) {
        value = ethers.utils.formatEther(value);
    }
    
    // Конвертуємо в число, якщо це рядок
    value = parseFloat(value);
    
    // Заокруглюємо до певної кількості знаків після коми
    return value.toFixed(decimals);
}

// Функція для форматування адреси гаманця (скорочення)
function formatAddress(address) {
    if (!address || address === 'Невідомо') return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// Функція для отримання кількості унікальних транзакцій
async function getUniqueTransactionsCount(address, provider) {
    try {
        // Отримуємо поточний блок
        const currentBlock = await provider.getBlockNumber();
        
        // Використовуємо значно менший діапазон блоків (100 замість 5000)
        // це відповідає обмеженню API Monad
        const startBlock = Math.max(0, currentBlock - 100);
        
        // Виконуємо запит до API для отримання унікальних транзакцій
        const transactions = new Set();
        
        try {
            const logs = await provider.getLogs({
                fromBlock: startBlock,
                toBlock: currentBlock,
                address: address
            });
            
            // Додаємо всі унікальні хеші транзакцій
            logs.forEach(log => {
                transactions.add(log.transactionHash);
            });
        } catch (error) {
            console.log(`ℹ️ Використовуємо тільки nonce для визначення кількості транзакцій`);
        }
        
        // Також перевіряємо вихідні транзакції
        const nonce = await provider.getTransactionCount(address);
        
        // Повертаємо більше з двох значень - або кількість унікальних логів, або nonce
        return Math.max(transactions.size, nonce);
    } catch (error) {
        console.log(`❌ Помилка отримання кількості транзакцій: ${error.message}`.red);
        return 0;
    }
}

// Функція для отримання кількості NFT на гаманці
async function getNFTCount(address, provider) {
    try {
        let totalNFTs = 0;
        
        // Використовуємо масив NFT контрактів з конфігурації
        if (config.NFT_CONTRACTS && config.NFT_CONTRACTS.length > 0) {
            for (const nftConfig of config.NFT_CONTRACTS) {
                try {
                    const nftContract = new ethers.Contract(
                        nftConfig.address,
                        [
                            'function balanceOf(address owner) view returns (uint256)',
                            'function name() view returns (string)'
                        ],
                        provider
                    );
                    
                    // Отримуємо баланс NFT для цього контракту
                    const nftBalance = await nftContract.balanceOf(address);
                    const nftCount = parseInt(nftBalance.toString());
                    
                    if (nftCount > 0) {
                        console.log(`🖼️ ${colors.cyan(`${nftConfig.name || 'NFT'}:`)} ${colors.yellow(nftCount)}`);
                    }
                    
                    // Додаємо до загальної кількості
                    totalNFTs += nftCount;
                } catch (error) {
                    // Ігноруємо помилки для окремих контрактів
                }
            }
        } else {
            console.log(`ℹ️ ${colors.cyan('Немає налаштованих NFT контрактів для відстеження')}`);
        }
        
        return totalNFTs;
    } catch (error) {
        console.log(`❌ Помилка отримання кількості NFT: ${error.message}`.red);
        return 0;
    }
}

// Запускаємо головну функцію
main().catch((error) => {
    console.error('Сталася помилка:', error);
}); 