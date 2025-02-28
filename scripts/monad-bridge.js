const { ethers } = require('ethers');
const colors = require('colors');
const prompts = require('prompts');
const utils = require('./utils');

// Адреси контрактів
const BRIDGE_ADDRESS = utils.CONTRACTS.MONAD_BRIDGE;
const WMON_ADDRESS = utils.CONTRACTS.WMON;

// Мінімальна сума для мосту
const MIN_BRIDGE_AMOUNT = utils.MIN_AMOUNTS.BRIDGE;

// Підтримувані мережі для мосту
const SUPPORTED_NETWORKS = {
  ETHEREUM: {
    name: 'Ethereum',
    chainId: 1,
    rpc: 'https://mainnet.infura.io/v3/your-infura-key',
    nativeCurrency: 'ETH'
  },
  ARBITRUM: {
    name: 'Arbitrum',
    chainId: 42161,
    rpc: 'https://arb1.arbitrum.io/rpc',
    nativeCurrency: 'ETH'
  },
  OPTIMISM: {
    name: 'Optimism',
    chainId: 10,
    rpc: 'https://mainnet.optimism.io',
    nativeCurrency: 'ETH'
  },
  BASE: {
    name: 'Base',
    chainId: 8453,
    rpc: 'https://mainnet.base.org',
    nativeCurrency: 'ETH'
  }
};

// Функція для відправки токенів через міст
async function bridgeTokens(wallet, targetNetwork, amount) {
  try {
    console.log(`\nStarting bridge operation to ${targetNetwork.name}...`.magenta);
    console.log(`Will bridge ${ethers.utils.formatEther(amount)} MON to ${targetNetwork.name}`.yellow);
    
    // Спочатку обгортаємо MON в WMON, якщо потрібно
    const wrapResult = await utils.wrapMON(wallet, amount);
    if (!wrapResult) {
      console.error(`Failed to wrap MON. Aborting bridge operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    await utils.delay(5, 10);
    
    // Схвалюємо WMON для мосту
    const approveResult = await utils.approveToken(wallet, WMON_ADDRESS, amount, BRIDGE_ADDRESS);
    if (!approveResult) {
      console.error(`Failed to approve WMON. Aborting bridge operation.`.red);
      return false;
    }
    
    // Затримка між операціями
    await utils.delay(5, 10);
    
    // ABI для мосту (спрощений)
    const bridgeAbi = [
      'function bridge(address token, uint256 amount, uint256 targetChainId) external returns (bytes32)'
    ];
    
    const bridgeContract = new ethers.Contract(BRIDGE_ADDRESS, bridgeAbi, wallet);
    
    // Відправляємо транзакцію для мосту
    console.log(`Sending tokens to ${targetNetwork.name} via bridge...`.cyan);
    const tx = await bridgeContract.bridge(
      WMON_ADDRESS,
      amount,
      targetNetwork.chainId
    );
    
    console.log(`Bridge transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${utils.EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Bridge transaction confirmed in block ${receipt.blockNumber}`.green);
    
    // Отримуємо ідентифікатор транзакції мосту з подій
    let bridgeId = '';
    if (receipt.logs && receipt.logs.length > 0) {
      // Припускаємо, що перша подія містить ідентифікатор мосту
      bridgeId = receipt.logs[0].topics[1];
      console.log(`Bridge ID: ${bridgeId}`.yellow);
      console.log(`You can track your bridge transaction status at: https://bridge.monad.xyz/tx/${bridgeId}`.blue);
    }
    
    console.log(`\nBridge operation completed successfully!`.green.bold);
    console.log(`Your tokens will arrive on ${targetNetwork.name} in 10-30 minutes.`.yellow);
    
    return true;
  } catch (error) {
    console.error(`Error in bridge operation: ${error.message}`.red);
    return false;
  }
}

// Головна функція для мосту
async function runBridge(wallet, useDelay = true) {
  try {
    console.log(`\nStarting Monad Bridge module...`.magenta);
    
    // Отримуємо баланс гаманця
    const balance = await wallet.getBalance();
    console.log(`Wallet balance: ${ethers.utils.formatEther(balance)} MON`.green);
    
    // Перевіряємо, чи достатньо балансу
    if (balance.lt(MIN_BRIDGE_AMOUNT)) {
      console.error(`Insufficient balance. You need at least ${ethers.utils.formatEther(MIN_BRIDGE_AMOUNT)} MON`.red);
      return false;
    }
    
    // Отримуємо випадкову суму для мосту (між 0.1 та 0.2 MON)
    const bridgeAmount = utils.getRandomAmount(0.1, 0.2);
    console.log(`Will bridge ${ethers.utils.formatEther(bridgeAmount)} MON`.yellow);
    
    // Вибираємо випадкову цільову мережу
    const networks = Object.values(SUPPORTED_NETWORKS);
    const targetNetwork = networks[Math.floor(Math.random() * networks.length)];
    console.log(`Selected target network: ${targetNetwork.name}`.yellow);
    
    // Затримка перед початком операції
    if (useDelay) {
      await utils.delay(5, 10);
    }
    
    // Виконуємо операцію мосту
    const result = await bridgeTokens(wallet, targetNetwork, bridgeAmount);
    
    return result;
  } catch (error) {
    console.error(`Error in Monad Bridge module: ${error.message}`.red);
    return false;
  }
}

// Інтерактивна функція для мосту
async function runInteractiveBridge() {
  console.log('Monad Bridge Module'.green.bold);
  console.log('================='.green);
  
  // Запитуємо, чи використовувати файл з гаманцями або ввести приватний ключ вручну
  const sourceResponse = await prompts({
    type: 'select',
    name: 'source',
    message: 'Select wallet source:',
    choices: [
      { title: 'Enter private key manually', value: 'manual' },
      { title: 'Use wallet.txt file', value: 'file' }
    ]
  });
  
  if (!sourceResponse.source) {
    console.log('Operation cancelled. Exiting...'.yellow);
    return;
  }
  
  let walletResults = [];
  
  if (sourceResponse.source === 'manual') {
    // Запитуємо приватний ключ
    const keyResponse = await prompts({
      type: 'password',
      name: 'privateKey',
      message: 'Enter your private key (will be hidden):',
      validate: value => value.length >= 64 ? true : 'Private key must be at least 64 characters'
    });
    
    if (!keyResponse.privateKey) {
      console.log('No private key provided. Exiting...'.yellow);
      return;
    }
    
    // Форматуємо приватний ключ
    const privateKey = keyResponse.privateKey.startsWith('0x') 
      ? keyResponse.privateKey 
      : `0x${keyResponse.privateKey}`;
    
    // Запитуємо, чи використовувати проксі
    const proxyResponse = await prompts({
      type: 'confirm',
      name: 'useProxy',
      message: 'Do you want to use a proxy?',
      initial: false
    });
    
    let proxy = null;
    
    if (proxyResponse.useProxy) {
      const proxyInputResponse = await prompts({
        type: 'text',
        name: 'proxy',
        message: 'Enter proxy (format: username:password@host:port):',
        validate: value => value.includes('@') ? true : 'Invalid proxy format'
      });
      
      if (proxyInputResponse.proxy) {
        proxy = proxyInputResponse.proxy;
      }
    }
    
    console.log('Checking wallet balance...'.yellow);
    const result = await utils.checkWalletBalance(privateKey, proxy);
    walletResults.push({ ...result, privateKey, proxy });
    
    console.log(`Wallet ${result.address}: ${ethers.utils.formatEther(result.balance)} MON - ${result.hasEnoughBalance ? 'SUFFICIENT'.green : 'INSUFFICIENT'.red}`);
  } else {
    // Читаємо список приватних ключів з файлу wallet.txt
    try {
      const wallets = require('fs')
        .readFileSync('wallet.txt', 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line.length >= 64)
        .map(key => key.startsWith('0x') ? key : `0x${key}`);
      
      if (wallets.length === 0) {
        console.error('No valid wallets found in wallet.txt. Exiting...'.red);
        return;
      }
      
      // Запитуємо, чи використовувати проксі
      const proxyResponse = await prompts({
        type: 'confirm',
        name: 'useProxy',
        message: 'Do you want to use proxies from proxy.txt?',
        initial: false
      });
      
      let proxies = [];
      
      if (proxyResponse.useProxy) {
        try {
          proxies = require('fs')
            .readFileSync('proxy.txt', 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(proxy => proxy.trim());
          
          if (proxies.length === 0) {
            console.error('No proxies found in proxy.txt. Continuing without proxies...'.yellow);
          } else {
            console.log(`Loaded ${proxies.length} proxies from proxy.txt`.green);
          }
        } catch (error) {
          console.error(`Error reading proxy.txt: ${error.message}. Continuing without proxies...`.yellow);
        }
      }
      
      console.log('Checking wallet balances...'.yellow);
      
      // Перевіряємо баланси всіх гаманців
      for (let i = 0; i < wallets.length; i++) {
        const privateKey = wallets[i];
        const proxy = proxies.length > 0 ? proxies[i % proxies.length] : null;
        
        const result = await utils.checkWalletBalance(privateKey, proxy);
        walletResults.push({ ...result, privateKey, proxy });
        
        console.log(`Wallet ${i+1}/${wallets.length}: ${result.address}: ${ethers.utils.formatEther(result.balance)} MON - ${result.hasEnoughBalance ? 'SUFFICIENT'.green : 'INSUFFICIENT'.red}`);
      }
    } catch (error) {
      console.error(`Error reading wallet.txt: ${error.message}`.red);
      return;
    }
  }
  
  // Фільтруємо гаманці з достатнім балансом
  const validWallets = walletResults.filter(w => w.hasEnoughBalance && w.balance.gte(MIN_BRIDGE_AMOUNT));
  
  console.log(`\nFound ${validWallets.length} of ${walletResults.length} wallets with sufficient balance for bridge`.yellow);
  
  if (validWallets.length === 0) {
    console.log(`No wallets with sufficient balance (min ${ethers.utils.formatEther(MIN_BRIDGE_AMOUNT)} MON). Exiting...`.red);
    return;
  }
  
  // Вибір гаманця
  const walletResponse = await prompts({
    type: 'select',
    name: 'walletIndex',
    message: 'Select a wallet to use:',
    choices: validWallets.map((w, i) => ({ 
      title: `${w.address} (${ethers.utils.formatEther(w.balance)} MON)`, 
      value: i 
    }))
  });
  
  if (walletResponse.walletIndex === undefined) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  const selectedWallet = validWallets[walletResponse.walletIndex];
  
  // Вибір цільової мережі
  const networkResponse = await prompts({
    type: 'select',
    name: 'network',
    message: 'Select target network:',
    choices: Object.values(SUPPORTED_NETWORKS).map(network => ({ 
      title: network.name, 
      value: network 
    }))
  });
  
  if (!networkResponse.network) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  // Запитуємо суму для мосту
  const amountResponse = await prompts({
    type: 'text',
    name: 'amount',
    message: `Enter amount of MON to bridge (min ${ethers.utils.formatEther(MIN_BRIDGE_AMOUNT)}):`,
    initial: '0.1',
    validate: value => {
      try {
        const amount = ethers.utils.parseEther(value);
        if (amount.lt(MIN_BRIDGE_AMOUNT)) {
          return `Amount must be at least ${ethers.utils.formatEther(MIN_BRIDGE_AMOUNT)} MON`;
        }
        if (amount.gt(selectedWallet.balance)) {
          return `Amount exceeds wallet balance (${ethers.utils.formatEther(selectedWallet.balance)} MON)`;
        }
        return true;
      } catch (error) {
        return 'Invalid amount format';
      }
    }
  });
  
  if (!amountResponse.amount) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  const bridgeAmount = ethers.utils.parseEther(amountResponse.amount);
  
  // Запитуємо, чи використовувати затримку
  const delayResponse = await prompts({
    type: 'confirm',
    name: 'useDelay',
    message: 'Use random delay between operations?',
    initial: true
  });
  
  // Запускаємо операцію мосту
  console.log(`\nStarting bridge operation with wallet ${selectedWallet.address}`.cyan);
  
  if (selectedWallet.proxy) {
    console.log(`Using proxy: ${selectedWallet.proxy}`.cyan);
  }
  
  // Виконуємо операцію мосту
  await bridgeTokens(
    selectedWallet.wallet,
    networkResponse.network,
    bridgeAmount
  );
  
  console.log(`\nOperation completed!`.green.bold);
}

// Якщо скрипт запущено напряму, виконуємо інтерактивну функцію
if (require.main === module) {
  runInteractiveBridge().catch((error) => {
    console.error('Error occurred:', error);
  });
}

// Експортуємо функції для використання в інших модулях
module.exports = {
  runBridge,
  bridgeTokens,
  SUPPORTED_NETWORKS
}; 