const prompts = require('prompts');
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('./config');

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
        { name: 'aPriori Staking', run: async () => await require('./scripts/apriori-multi').runStaking(wallet) },
        { name: 'Bean Exchange', run: async () => await require('./scripts/bean-multi').runSwap(wallet) }
    ];

    // Перемішуємо масив модулів
    const shuffledModules = [...modules].sort(() => Math.random() - 0.5);

    console.log(`\nStarting operations for account ${wallet.address} using proxy ${proxy}`.cyan);
    console.log(`Wallet balance: ${ethers.utils.formatEther(await wallet.getBalance())} MON`.green);
    console.log(`Running modules in random order: ${shuffledModules.map(m => m.name).join(' -> ')}`.yellow);

    // Запускаємо модулі по черзі
    for (const module of shuffledModules) {
        console.log(`\nStarting ${module.name}...`.magenta);
        await module.run();
        console.log(`${module.name} completed`.green);
    }
}

// Головна функція
async function main() {
    console.log('Starting wallet balance check...'.yellow);

    const walletResults = [];
    
    // Перевіряємо баланси всіх гаманців
    for (let i = 0; i < config.WALLETS.length; i++) {
        const privateKey = config.WALLETS[i];
        const proxy = config.PROXIES[i % config.PROXIES.length];
        
        const result = await checkWalletBalance(privateKey, proxy);
        walletResults.push({ ...result, privateKey, proxy });
        
        console.log(`Wallet ${result.address}: ${ethers.utils.formatEther(result.balance)} MON - ${result.hasEnoughBalance ? 'SUFFICIENT'.green : 'INSUFFICIENT'.red}`);
    }

    // Фільтруємо гаманці з достатнім балансом
    const validWallets = walletResults.filter(w => w.hasEnoughBalance);
    
    console.log(`\nFound ${validWallets.length} of ${config.WALLETS.length} wallets with sufficient balance`.yellow);
    
    if (validWallets.length === 0) {
        console.log('No wallets with sufficient balance. Exiting...'.red);
        return;
    }

    // Запитуємо користувача, чи продовжувати
    const response = await prompts({
        type: 'confirm',
        name: 'continue',
        message: `Continue with ${validWallets.length} wallets?`,
        initial: true
    });

    if (!response.continue) {
        console.log('Operation cancelled by user. Exiting...'.yellow);
        return;
    }

    // Запускаємо модулі для кожного гаманця з достатнім балансом
    for (const walletData of validWallets) {
        await runModulesInRandomOrder(walletData.wallet, walletData.provider, walletData.proxy);
    }

    console.log(`\nAll operations completed successfully!`.green.bold);
}

main().catch((error) => {
    console.error('Error occurred:', error);
});
