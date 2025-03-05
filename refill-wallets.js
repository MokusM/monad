const { ethers } = require('ethers');
const colors = require('colors');
const prompts = require('prompts');
const config = require('./config');

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

// Функція для надсилання MON з основного гаманця до потрібних гаманців
async function transferMON(fromWallet, toAddress, amount) {
    try {
        console.log(`\n${colors.cyan('=')} Перезаправка гаманця ${colors.yellow(toAddress)} ${colors.cyan('=')}`);
        console.log(`🔄 Надсилаємо ${colors.green(formatNumber(amount))} MON з гаманця ${colors.yellow(fromWallet.address)}`);
        
        // Створюємо транзакцію
        const tx = await fromWallet.sendTransaction({
            to: toAddress,
            value: amount,
            gasLimit: 30000,
        });
        
        console.log(`✅ Транзакція відправлена: ${colors.yellow(config.EXPLORER_URL + tx.hash)}`);
        
        // Чекаємо підтвердження
        console.log(`⏳ Очікуємо підтвердження транзакції...`);
        const receipt = await tx.wait();
        
        if (receipt.status === 1) {
            console.log(`✅ Транзакція успішно підтверджена у блоці ${colors.yellow(receipt.blockNumber)}`.green);
            return true;
        } else {
            console.error(`❌ Транзакція не виконана`.red);
            return false;
        }
    } catch (error) {
        console.error(`❌ Помилка перезаправки: ${error.message}`.red);
        return false;
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

// Головна функція
async function main() {
    console.log('\n' + colors.bold.green('=== ПЕРЕЗАПРАВКА ГАМАНЦІВ ==='));
    console.log(colors.yellow(`Дата та час: ${new Date().toLocaleString()}`));
    console.log(colors.yellow(`Мінімальний баланс: ${config.MIN_BALANCE} MON`));
    
    // Перевіряємо баланси всіх гаманців
    console.log('\n' + colors.cyan('Перевіряємо баланси гаманців...'));
    
    const walletResults = [];
    
    for (let i = 0; i < config.WALLETS.length; i++) {
        const privateKey = config.WALLETS[i];
        const proxy = config.PROXIES[i % config.PROXIES.length];
        
        process.stdout.write(`Перевірка гаманця ${i + 1}/${config.WALLETS.length}... `);
        const result = await checkWalletBalance(privateKey, proxy);
        
        // Визначаємо колір для статусу
        let statusColor;
        if (result.status === 'OK') {
            statusColor = colors.green;
        } else if (result.status === 'НИЗЬКИЙ') {
            statusColor = colors.yellow;
        } else {
            statusColor = colors.red;
        }
        
        console.log(`${formatAddress(result.address)} - ${statusColor(result.status)} (${formatNumber(result.totalBalance)} MON)`);
        
        walletResults.push({
            ...result,
            privateKey,
            proxy,
            index: i
        });
    }
    
    // Таблиця з усіма гаманцями
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
    
    // Фільтруємо гаманці з низьким/недостатнім балансом
    const lowBalanceWallets = walletResults.filter(w => w.status === 'НИЗЬКИЙ' || w.status === 'НЕДОСТАТНЬО');
    
    if (lowBalanceWallets.length === 0) {
        console.log('\n' + colors.green('✅ Усі гаманці мають достатній баланс. Перезаправка не потрібна.'));
        return;
    }
    
    console.log('\n' + colors.yellow(`Знайдено ${lowBalanceWallets.length} гаманців, які потребують поповнення:`));
    
    lowBalanceWallets.forEach((wallet, index) => {
        const statusColor = wallet.status === 'НИЗЬКИЙ' ? colors.yellow : colors.red;
        console.log(`${index + 1}. ${wallet.address} - ${statusColor(wallet.status)} (${formatNumber(wallet.totalBalance)} MON)`);
    });
    
    // Запитуємо користувача про гаманець для перезаправки
    console.log('\n' + colors.cyan('Оберіть гаманець-джерело для перезаправки:'));
    
    // Фільтруємо гаманці з достатнім балансом для перезаправки
    const sourceWallets = walletResults.filter(w => w.status === 'OK');
    
    if (sourceWallets.length === 0) {
        console.log('\n' + colors.red('❌ Немає гаманців з достатнім балансом для перезаправки. Операція неможлива.'));
        return;
    }
    
    const sourceOptions = sourceWallets.map((wallet, index) => ({
        title: `${formatAddress(wallet.address)} - ${formatNumber(wallet.totalBalance)} MON`,
        value: index
    }));
    
    const sourceResponse = await prompts({
        type: 'select',
        name: 'sourceIndex',
        message: 'Оберіть гаманець-джерело:',
        choices: sourceOptions,
        initial: 0
    });
    
    if (sourceResponse.sourceIndex === undefined) {
        console.log('\n' + colors.yellow('Операція скасована користувачем.'));
        return;
    }
    
    const sourceWallet = sourceWallets[sourceResponse.sourceIndex];
    
    // Запитуємо суму для перезаправки
    const defaultAmount = 0.5; // 0.5 MON за замовчуванням
    
    const amountResponse = await prompts({
        type: 'number',
        name: 'amount',
        message: 'Введіть суму для перезаправки (MON):',
        initial: defaultAmount,
        min: 0.01,
        max: parseFloat(ethers.utils.formatEther(sourceWallet.monBalance)) - 0.01 // Залишаємо трохи на газ
    });
    
    if (amountResponse.amount === undefined) {
        console.log('\n' + colors.yellow('Операція скасована користувачем.'));
        return;
    }
    
    const amountMON = ethers.utils.parseEther(amountResponse.amount.toString());
    
    // Запитуємо підтвердження
    const confirmResponse = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: `Ви впевнені, що хочете перезаправити ${lowBalanceWallets.length} гаманців на суму ${amountResponse.amount} MON кожен?`,
        initial: true
    });
    
    if (!confirmResponse.confirm) {
        console.log('\n' + colors.yellow('Операція скасована користувачем.'));
        return;
    }
    
    // Виконуємо перезаправку
    console.log('\n' + colors.cyan('Починаємо перезаправку гаманців...'));
    
    let successCount = 0;
    
    for (const wallet of lowBalanceWallets) {
        const success = await transferMON(sourceWallet.wallet, wallet.address, amountMON);
        if (success) {
            successCount++;
        }
    }
    
    console.log('\n' + colors.green(`✅ Перезаправка завершена. Успішно поповнено ${successCount} з ${lowBalanceWallets.length} гаманців.`));
    
    if (successCount > 0) {
        console.log('\n' + colors.cyan('Рекомендуємо перевірити баланси гаманців через кілька хвилин: node check-wallets.js'));
    }
}

// Функція для форматування адреси гаманця (скорочення)
function formatAddress(address) {
    if (!address || address === 'Невідомо') return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// Запускаємо головну функцію
main().catch((error) => {
    console.error('Сталася помилка:', error);
}); 