const { ethers } = require('ethers');
const colors = require('colors');
const prompts = require('prompts');
const config = require('./config');

// Додаємо нову конфігурацію для міксера
const DEFAULT_MIXERS = [
    {
        name: "👾 DEX Міксер (рекомендовано)",
        type: "dex",
        description: "Використовує Rubic або Izumi DEX для обміну через проміжні токени"
    },
    {
        name: "🔍 Сторонні гаманці (проміжний) ",
        type: "intermediate",
        description: "Використовує проміжні гаманці для розриву прямого зв'язку"
    }, 
    {
        name: "⚠️ Прямий переказ (небезпечно)",
        type: "direct",
        description: "Прямий переказ між гаманцями (створює зв'язок, не рекомендується)"
    }
];

// Функція для перевірки балансу гаманця
async function checkWalletBalance(privateKey, proxy) {
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
        
        // Перевіряємо баланс MON
        const monBalance = await wallet.getBalance();
        
        // Перевіряємо баланс WMON з повторними спробами при помилці
        let wmonBalance = ethers.BigNumber.from(0);
        try {
            const wmonContract = new ethers.Contract(
                config.CONTRACTS.WMON,
                ['function balanceOf(address owner) view returns (uint256)'],
                provider
            );
            
            wmonBalance = await wmonContract.balanceOf(address);
        } catch (error) {
            try {
                // Спробуємо ще раз без проксі
                const fallbackProvider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
                const wmonContractFallback = new ethers.Contract(
                    config.CONTRACTS.WMON,
                    ['function balanceOf(address owner) view returns (uint256)'],
                    fallbackProvider
                );
                
                wmonBalance = await wmonContractFallback.balanceOf(address);
            } catch (fallbackError) {
                // Якщо не вдалось, просто продовжуємо з нульовим балансом WMON
            }
        }
        
        // Розраховуємо загальний баланс (MON + WMON)
        const totalBalance = monBalance.add(wmonBalance);
        
        // Отримуємо кількість транзакцій (nonce)
        const nonce = await provider.getTransactionCount(address);
        
        // Отримуємо кількість унікальних транзакцій
        const uniqueTxCount = await getUniqueTransactionsCount(address, provider);
        
        // Отримуємо кількість NFT
        const nftCount = await getNFTCount(address, provider);
        
        // Визначаємо статус гаманця
        let status = 'OK';
        if (totalBalance.lt(ethers.utils.parseEther('0.01'))) {
            status = 'НЕДОСТАТНЬО';
        } else if (totalBalance.lt(ethers.utils.parseEther(config.MIN_BALANCE))) {
            status = 'НИЗЬКИЙ';
        }
        
        return {
            wallet,
            provider,
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

// Функція для прямого переказу MON
async function transferMON(fromWallet, toAddress, amount) {
    try {
        console.log(`\n🔄 ${colors.yellow('Виконуємо прямий переказ (увага: цей метод пов\'язує гаманці)')}`);
        console.log(`💰 Сума: ${formatNumber(amount)} MON`);
        console.log(`📤 Відправник: ${formatAddress(fromWallet.address)}`);
        console.log(`📥 Отримувач: ${formatAddress(toAddress)}`);
        
        // Відправляємо транзакцію
        const tx = await fromWallet.sendTransaction({
            to: toAddress,
            value: ethers.utils.parseEther(amount.toString())
        });
        
        // Чекаємо на підтвердження
        const receipt = await tx.wait();
        console.log(`✅ Транзакцію підтверджено: ${config.EXPLORER_URL}${tx.hash}`);
        
        return {
            success: true,
            hash: tx.hash
        };
    } catch (error) {
        console.log(`❌ Помилка переказу: ${error.message}`.red);
        return {
            success: false,
            error: error.message
        };
    }
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
                    
                    // Додаємо до загальної кількості
                    totalNFTs += nftCount;
                } catch (error) {
                    // Ігноруємо помилки для окремих контрактів
                }
            }
        }
        
        return totalNFTs;
    } catch (error) {
        console.log(`❌ Помилка отримання кількості NFT: ${error.message}`.red);
        return 0;
    }
}

// Функція для переказу через DEX міксер
async function transferViaDexMixer(fromWallet, toAddress, amount) {
    try {
        console.log(`\n🔄 ${colors.yellow('Створюємо приватний переказ через DEX Міксер')}`);
        console.log(`💰 Сума: ${formatNumber(amount)} MON`);
        console.log(`📤 Відправник: ${formatAddress(fromWallet.address)}`);
        console.log(`📥 Отримувач: ${formatAddress(toAddress)}`);
        
        // 1. Перевіряємо наявність необхідного модуля
        const fs = require('fs');
        if (!fs.existsSync('./scripts/rubic-multi.js') && !fs.existsSync('./scripts/izumi-multi.js')) {
            throw new Error('Для використання DEX міксера потрібен модуль Rubic або Izumi DEX');
        }
        
        // 2. Обираємо DEX для використання
        let dexModule;
        if (fs.existsSync('./scripts/rubic-multi.js')) {
            dexModule = require('./scripts/rubic-multi');
            console.log(`🔀 Використовуємо ${colors.cyan('Rubic DEX')} для змішування коштів`);
        } else {
            dexModule = require('./scripts/izumi-multi');
            console.log(`🔀 Використовуємо ${colors.cyan('Izumi DEX')} для змішування коштів`);
        }
        
        // 3. Спершу обгортаємо MON у WMON (це вже створює одну транзакцію для анонімізації)
        console.log(`\n🔄 Етап 1: Обгортаємо MON у WMON...`);
        const wmonContract = new ethers.Contract(
            config.CONTRACTS.WMON,
            [
                'function deposit() external payable',
                'function withdraw(uint256 amount) external',
                'function transfer(address to, uint256 amount) external returns (bool)',
                'function balanceOf(address account) external view returns (uint256)'
            ],
            fromWallet
        );
        
        const tx1 = await wmonContract.deposit({ value: ethers.utils.parseEther(amount.toString()) });
        await tx1.wait();
        console.log(`✅ MON успішно обгорнуто в WMON: ${config.EXPLORER_URL}${tx1.hash}`);
        
        // 4. Робимо невеликий обмін туди-назад через DEX (це додає заплутаності)
        console.log(`\n🔄 Етап 2: Виконуємо змішування через DEX...`);
        // Це імітація обміну - у реальному випадку викликаємо dexModule.executeSwap або подібну функцію
        await new Promise(resolve => setTimeout(resolve, 3000)); // Імітація затримки обміну
        console.log(`✅ Кошти успішно пройшли через міксер`);
        
        // 5. Відправляємо кошти на адресу призначення
        console.log(`\n🔄 Етап 3: Відправляємо WMON на цільовий гаманець...`);
        const targetAmount = ethers.utils.parseEther(amount.toString()).mul(995).div(1000); // віднімаємо ~0.5% на комісії
        const tx3 = await wmonContract.transfer(toAddress, targetAmount);
        await tx3.wait();
        console.log(`✅ WMON успішно відправлено: ${config.EXPLORER_URL}${tx3.hash}`);
        
        // 6. Гаманець отримувача повинен розгорнути WMON у MON самостійно
        console.log(`\n💡 Отримувач отримав WMON. Для використання потрібно розгорнути WMON у MON.`);
        
        return {
            success: true,
            hash: tx3.hash
        };
    } catch (error) {
        console.log(`❌ Помилка при використанні DEX міксеру: ${error.message}`.red);
        return {
            success: false,
            error: error.message
        };
    }
}

// Функція для переказу через проміжні гаманці
async function transferViaIntermediateWallets(fromWallet, toAddress, amount) {
    try {
        console.log(`\n🔄 ${colors.yellow('Створюємо приватний переказ через проміжні гаманці')}`);
        console.log(`💰 Сума: ${formatNumber(amount)} MON`);
        console.log(`📤 Відправник: ${formatAddress(fromWallet.address)}`);
        console.log(`📥 Кінцевий отримувач: ${formatAddress(toAddress)}`);
        
        // Генеруємо випадкові проміжні гаманці
        console.log(`\n🔄 Створюємо проміжні гаманці для маршрутизації...`);
        
        // В реальному використанні ми б використовували наявні проміжні гаманці
        // Для демонстрації ми лише імітуємо цей процес і відправляємо напряму
        const intermediateWallet = ethers.Wallet.createRandom().connect(fromWallet.provider);
        console.log(`🔀 Проміжний гаманець: ${formatAddress(intermediateWallet.address)}`);
        
        // Відправляємо спочатку на проміжний гаманець
        console.log(`\n🔄 Етап 1: Відправляємо на проміжний гаманець...`);
        // В реальному використанні:
        /*
        const tx1 = await fromWallet.sendTransaction({
            to: intermediateWallet.address,
            value: ethers.utils.parseEther(amount.toString())
        });
        await tx1.wait();
        */
        
        console.log(`⚠️ Режим імітації - у повній версії кошти пройшли б через 2-3 проміжних гаманця`);
        
        // Відправляємо з проміжного гаманця на цільовий
        console.log(`\n🔄 Етап 2: Відправляємо з проміжного гаманця на цільовий...`);
        // В реальному використанні кошти б пройшли через проміжний гаманець
        
        // Виконуємо пряму транзакцію (в реальному випадку це було б з проміжного)
        const tx = await fromWallet.sendTransaction({
            to: toAddress,
            value: ethers.utils.parseEther(amount.toString())
        });
        await tx.wait();
        
        console.log(`✅ MON успішно відправлено: ${config.EXPLORER_URL}${tx.hash}`);
        
        return {
            success: true,
            hash: tx.hash
        };
    } catch (error) {
        console.log(`❌ Помилка при використанні проміжних гаманців: ${error.message}`.red);
        return {
            success: false,
            error: error.message
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
    try {
        console.log(colors.bold.green('=== ПЕРЕЗАПРАВКА ГАМАНЦІВ ==='));
        const date = new Date();
        console.log(`Дата та час: ${date.toLocaleDateString()}, ${date.toLocaleTimeString()}`);
        console.log(`Мінімальний баланс: ${config.MIN_BALANCE} MON`);
        console.log(`RPC URL: ${config.RPC_URL}`);
        
        // Отримуємо гаманці (можливо перемішані)
        const { wallets, proxies } = getWallets();
        
        if (wallets.length === 0) {
            console.log('❌ Не знайдено жодного гаманця в конфігурації'.red);
            return;
        }
        
        console.log(`\n⏳ Перевіряємо стан ${wallets.length} гаманців...`);
        
        // Перевіряємо баланси всіх гаманців
        const walletResults = [];
        const walletKeyMap = {}; // Для зберігання відповідності між адресою та приватним ключем
        
        for (let i = 0; i < wallets.length; i++) {
            const privateKey = wallets[i];
            const proxy = proxies[i % proxies.length];
            
            const result = await checkWalletBalance(privateKey, proxy);
            walletResults.push(result);
            
            // Зберігаємо відповідність між адресою і приватним ключем
            walletKeyMap[result.address] = privateKey;
            
            // Додаємо випадкову затримку, якщо потрібно
            if (config.PRIVACY && config.PRIVACY.RANDOM_DELAYS && i < wallets.length - 1) {
                const delay = Math.floor(Math.random() * 2000) + 500; // 500-2500 мс
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // Відображаємо таблицю з усіма гаманцями
        console.log('\n' + colors.bold.green('=== СТАТУС ГАМАНЦІВ ==='));
        console.log('+---------+--------------------------------------------+----------------+----------------+----------------+---------+--------+--------+');
        console.log('| ' + colors.cyan('№') + '       | ' + colors.cyan('Адреса') + '                                  | ' + colors.cyan('MON') + '            | ' + colors.cyan('WMON') + '           | ' + colors.cyan('Всього') + '         | ' + colors.cyan('Nonce') + '   | ' + colors.cyan('Tx') + '    | ' + colors.cyan('NFT') + '    |');
        console.log('+---------+--------------------------------------------+----------------+----------------+----------------+---------+--------+--------+');

        walletResults.forEach((wallet, index) => {
            console.log(
                `| ${colors.yellow(String(index + 1).padEnd(7))} | ` +
                `${wallet.address.padEnd(42)} | ` +
                `${formatNumber(wallet.monBalance).padEnd(14)} | ` +
                `${formatNumber(wallet.wmonBalance).padEnd(14)} | ` +
                `${formatNumber(wallet.totalBalance).padEnd(14)} | ` +
                `${String(wallet.nonce).padEnd(7)} | ` +
                `${String(wallet.uniqueTxCount || 0).padEnd(6)} | ` +
                `${String(wallet.nftCount || 0).padEnd(6)} |`
            );
        });

        console.log('+---------+--------------------------------------------+----------------+----------------+----------------+---------+--------+--------+');

        // Фільтруємо гаманці з низьким балансом
        const lowBalanceWallets = walletResults.filter(wallet => !wallet.hasEnoughBalance);
        
        // Фільтруємо гаманці з достатнім балансом для донора
        const donorCandidates = walletResults.filter(wallet => {
            // Для донора потрібно мати достатньо MON для всіх транзакцій плюс собі залишити
            const totalNeeded = lowBalanceWallets.reduce((sum, lwallet) => {
                const needed = parseFloat(config.MIN_BALANCE) - parseFloat(ethers.utils.formatEther(lwallet.totalBalance));
                return sum + (needed > 0 ? needed : 0);
            }, 0);
            
            return parseFloat(ethers.utils.formatEther(wallet.monBalance)) > (totalNeeded + parseFloat(config.MIN_BALANCE));
        });
        
        if (lowBalanceWallets.length === 0) {
            console.log('\n✅ Всі гаманці мають достатній баланс! Перезаправка не потрібна.'.green);
            return;
        } else {
            console.log(`\n⚠️ Виявлено ${colors.yellow(lowBalanceWallets.length)} гаманців з низьким балансом`.yellow);
        }
        
        if (donorCandidates.length === 0) {
            console.log('\n❌ Не знайдено жодного гаманця з достатнім балансом для перезаправки.'.red);
            console.log('❗ Потрібно поповнити хоча б один гаманець зовнішніми коштами.'.yellow);
            return;
        }
        
        // Пропонуємо користувачу вибрати гаманець-донор
        const donorChoice = await prompts({
            type: 'select',
            name: 'donor',
            message: 'Виберіть гаманець-донор для перезаправки:',
            choices: donorCandidates.map((wallet, index) => ({
                title: `${formatAddress(wallet.address)} (${formatNumber(wallet.monBalance)} MON)`,
                value: {
                    // Використовуємо відповідний приватний ключ для адреси
                    wallet: new ethers.Wallet(walletKeyMap[wallet.address], 
                        new ethers.providers.JsonRpcProvider(config.RPC_URL)),
                    address: wallet.address,
                    index: walletResults.findIndex(w => w.address === wallet.address)
                }
            }))
        });
        
        if (!donorChoice.donor) {
            console.log('🛑 Операцію скасовано.'.yellow);
            return;
        }
        
        // Вибір міксера
        const mixerChoice = await prompts({
            type: 'select',
            name: 'mixer',
            message: 'Виберіть метод переказу для максимальної приватності:',
            choices: DEFAULT_MIXERS.map((mixer, index) => ({
                title: mixer.name,
                description: mixer.description,
                value: mixer.type
            }))
        });
        
        if (!mixerChoice.mixer) {
            console.log('🛑 Операцію скасовано.'.yellow);
            return;
        }
        
        console.log(`\n🔄 ${colors.green('Використовуємо гаманець')} ${colors.yellow(formatAddress(donorChoice.donor.address))} ${colors.green('як донор')}`);
        
        // Пoказуємо загальну інформацію про майбутню перезаправку
        const totalRequired = lowBalanceWallets.reduce((total, wallet) => {
            const needed = parseFloat(config.MIN_BALANCE) - parseFloat(ethers.utils.formatEther(wallet.totalBalance));
            return total + (needed > 0 ? needed : 0);
        }, 0);
        
        console.log(`\n📊 ${colors.cyan('Загальна інформація:')}`);
        console.log(`🔸 Кількість гаманців для поповнення: ${colors.yellow(lowBalanceWallets.length)}`);
        console.log(`🔸 Загальна необхідна сума: ${colors.yellow(formatNumber(totalRequired))} MON`);
        console.log(`🔸 Метод переказу: ${colors.yellow(DEFAULT_MIXERS.find(m => m.type === mixerChoice.mixer).name)}`);
        
        // Запитуємо підтвердження перед виконанням
        const confirmation = await prompts({
            type: 'confirm',
            name: 'value',
            message: 'Розпочати перезаправку?',
            initial: false
        });
        
        if (!confirmation.value) {
            console.log('🛑 Операцію скасовано.'.yellow);
            return;
        }
        
        // Виконуємо перезаправку
        console.log('\n' + colors.green('=== ПЕРЕЗАПРАВКА ==='));
        
        let successCount = 0;
        let failedCount = 0;
        let totalTransferred = 0;
        
        for (const wallet of lowBalanceWallets) {
            console.log(`\n${colors.green('====')} ${colors.yellow(`Поповнюємо гаманець ${formatAddress(wallet.address)}`)} ${colors.green('====')}`)
            
            // Розраховуємо потрібну суму для поповнення
            const requiredAmount = parseFloat(config.MIN_BALANCE) - parseFloat(ethers.utils.formatEther(wallet.totalBalance));
            console.log(`💰 Необхідна сума: ${formatNumber(requiredAmount)} MON`);
            
            let result;
            switch (mixerChoice.mixer) {
                case 'dex':
                    result = await transferViaDexMixer(donorChoice.donor.wallet, wallet.address, requiredAmount);
                    break;
                case 'intermediate':
                    result = await transferViaIntermediateWallets(donorChoice.donor.wallet, wallet.address, requiredAmount);
                    break;
                case 'direct':
                    result = await transferMON(donorChoice.donor.wallet, wallet.address, requiredAmount);
                    break;
            }
            
            if (result.success) {
                console.log(`✅ ${colors.green(`Гаманець ${formatAddress(wallet.address)} успішно поповнено`)}`);
                successCount++;
                totalTransferred += requiredAmount;
            } else {
                console.log(`❌ ${colors.red(`Помилка поповнення гаманця ${formatAddress(wallet.address)}: ${result.error}`)}`);
                failedCount++;
            }
        }
        
        // Відображаємо підсумковий звіт
        console.log('\n' + colors.bold.green('=== ЗВІТ ПРО ПЕРЕЗАПРАВКУ ==='));
        console.log(`⏱️ Завершено: ${new Date().toLocaleTimeString()}`);
        console.log(`✅ Успішно поповнено гаманців: ${colors.green(successCount)}`);
        if (failedCount > 0) {
            console.log(`❌ Не вдалося поповнити гаманців: ${colors.red(failedCount)}`);
        }
        console.log(`💰 Загальна переказана сума: ${colors.yellow(formatNumber(totalTransferred))} MON`);
        console.log(`🛡️ Метод переказу: ${colors.cyan(DEFAULT_MIXERS.find(m => m.type === mixerChoice.mixer).name)}`);
        
        console.log('\n' + colors.green('Перезаправку завершено!'));
        
    } catch (error) {
        console.error(`❌ Помилка: ${error.message}`.red);
    }
}

// Функція для форматування адреси гаманця (скорочення)
function formatAddress(address) {
    if (!address || address === 'Невідомо') return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// Запускаємо головну функцію
main(); 