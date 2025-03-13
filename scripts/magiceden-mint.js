/**
 * Модуль для мінтингу NFT на MagicEden в мережі Monad testnet
 * Адаптовано з репозиторію 0xStarLabs/StarLabs-Monad
 */

require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('../config');
const walletUtils = require('../utils/wallet-utils');

// Контракти NFT на MagicEden - виправлені адреси з правильним checksum
const NFT_CONTRACTS = [
  '0x4269cde9751237634d972026583bd39dff10b6f8', // 0.01 $MON
  '0xb3b63ea6ad288f74c1268a50640919fadae84454', // 0.01 $MON
  '0xbf5340ac35c0653e4f30a52bca8de137bb717b56', // 0.001 $MON
  '0x3941ae709a872cd14af1871c8442aa4cf0967e84', // 0.01 $MON
  '0x0fa3da91d4469dfd8c7a0cb13c47d90c8e88d5bd', // free
  '0x95d04e083255fe1b71d690791301831b6896d183', // free
];

// ABI для мінтингу NFT
const NFT_ABI = [
  'function mint(uint256 quantity) external payable',
  'function mintingFee() external view returns (uint256)',
  'function name() external view returns (string)',
  'function balanceOf(address owner) external view returns (uint256)',
];

// Функція для створення затримки
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функція для отримання випадкової затримки між min та max секунд
function getRandomDelay(min = config.DELAYS.MIN_DELAY, max = config.DELAYS.MAX_DELAY) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

// Функція для виведення інформації про затримку
async function delay(min = config.DELAYS.MIN_DELAY, max = config.DELAYS.MAX_DELAY) {
  const delayTime = getRandomDelay(min, max);
  console.log(`⏳ Waiting for ${delayTime / 1000} seconds...`.yellow);
  await sleep(delayTime);
  console.log(`✅ Delay completed`.green);
}

// Функція для отримання випадкового контракту NFT
function getRandomNFTContract() {
  const randomIndex = Math.floor(Math.random() * NFT_CONTRACTS.length);
  return NFT_CONTRACTS[randomIndex];
}

// Функція для створення провайдера з проксі
function createProvider(proxy, rpcUrl = config.RPC_URL) {
  return new ethers.providers.JsonRpcProvider({
    url: rpcUrl,
    headers: {
      'Proxy-Authorization': `Basic ${Buffer.from(
        proxy.split('@')[0]
      ).toString('base64')}`,
    },
    timeout: config.RPC_TIMEOUT || 30000
  });
}

// Функція для перемикання між RPC-серверами
async function switchRpcProvider(wallet, proxy) {
  const alternativeRpcUrls = config.ALTERNATIVE_RPC_URLS || [config.RPC_URL];
  
  for (const rpcUrl of alternativeRpcUrls) {
    console.log(`🔄 Switching to RPC: ${rpcUrl}`.yellow);
    
    try {
      const provider = createProvider(proxy, rpcUrl);
      const newWallet = new ethers.Wallet(wallet.privateKey, provider);
      
      // Перевіряємо підключення
      await provider.getBlockNumber();
      console.log(`✅ Connected to RPC: ${rpcUrl}`.green);
      
      return newWallet;
    } catch (error) {
      console.log(`❌ Failed to connect to RPC: ${rpcUrl}`.red);
    }
  }
  
  throw new Error('All RPC servers are unavailable');
}

// Функція для повторних спроб виконання функції
async function retry(fn, maxRetries = config.RPC_RETRY_COUNT || 3, retryDelay = 2000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`⚠️ Attempt ${i + 1}/${maxRetries} failed: ${error.message}`.yellow);
      
      if (error.code === 'SERVER_ERROR' || error.message.includes('bad response')) {
        console.log(`🔄 RPC server issue detected, waiting before retry...`.yellow);
      }
      
      if (i < maxRetries - 1) {
        await sleep(retryDelay);
      }
    }
  }
  
  throw lastError;
}

// Функція для перевірки балансу MON
async function checkBalance(wallet) {
  return retry(async () => {
    const balance = await wallet.getBalance();
    console.log(`💰 Current balance: ${ethers.utils.formatEther(balance)} MON`.cyan);
    return balance;
  });
}

// Функція для мінтингу NFT
async function mintNFT(wallet, contractAddress, proxy) {
  try {
    console.log(`🖼️ Minting NFT from contract: ${contractAddress}`.cyan);
    
    // Створюємо контракт
    const contract = new ethers.Contract(
      contractAddress,
      NFT_ABI,
      wallet
    );
    
    // Отримуємо ім'я колекції
    let collectionName;
    try {
      collectionName = await retry(async () => await contract.name());
      console.log(`🖼️ Collection name: ${collectionName}`.cyan);
    } catch (error) {
      console.log(`❌ Error getting collection name: ${error.message}`.red);
      collectionName = "Unknown Collection";
    }
    
    // Отримуємо ціну мінтингу
    let mintingFee;
    try {
      mintingFee = await retry(async () => await contract.mintingFee());
      console.log(`💰 Minting fee: ${ethers.utils.formatEther(mintingFee)} MON`.cyan);
    } catch (error) {
      console.log(`💰 Minting fee not available, assuming free mint`.yellow);
      mintingFee = ethers.BigNumber.from(0);
    }
    
    // Налаштовуємо газ
    const gasPrice = ethers.utils.parseUnits(config.GAS.GAS_PRICE.toString(), 'gwei');
    const gasLimit = config.GAS.DEFAULT_GAS_LIMIT || 500000;
    
    // Відправляємо транзакцію
    console.log(`📤 Sending NFT mint transaction...`.cyan);
    
    const tx = await contract.mint({
      value: mintingFee,
      gasPrice,
      gasLimit
    });
    
    console.log(`✅ NFT mint transaction sent! Hash: ${tx.hash}`.green);
    
    // Чекаємо підтвердження транзакції
    console.log(`⏳ Waiting for transaction confirmation...`.yellow);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`✅ NFT minted successfully!`.green.bold);
      return true;
    } else {
      console.log(`❌ NFT minting failed`.red);
      return false;
    }
  } catch (error) {
    console.log(`❌ Error minting NFT: ${error.message}`.red);
    
    // Якщо помилка пов'язана з RPC, спробуємо перемкнутися на інший RPC
    if (error.message.includes('SERVER_ERROR') || 
        error.message.includes('CALL_EXCEPTION') || 
        error.message.includes('TIMEOUT')) {
      console.log('Trying to switch RPC provider...'.yellow);
      
      try {
        // Створюємо новий провайдер
        const newProvider = await switchRpcProvider(proxy);
        
        // Створюємо новий гаманець з новим провайдером
        const newWallet = new ethers.Wallet(wallet.privateKey, newProvider);
        
        // Рекурсивно викликаємо функцію з новим гаманцем
        return await mintNFT(newWallet, contractAddress, proxy);
      } catch (switchError) {
        console.log(`Failed to switch RPC provider: ${switchError.message}`.red);
      }
    }
    
    return false;
  }
}

// Головна функція для мінтингу NFT
async function runMint(wallet, proxy) {
  try {
    console.log(`Starting MagicEden NFT minting operation:`.magenta);
    
    // Перевіряємо баланс перед операцією
    await checkBalance(wallet);
    
    // Отримуємо випадковий контракт NFT
    const nftContract = getRandomNFTContract();
    
    // Мінтимо NFT
    await mintNFT(wallet, nftContract, proxy);
    
    console.log(`MagicEden NFT minting operation completed`.green);
    return true;
  } catch (error) {
    console.error(`❌ MagicEden NFT minting operation failed: ${error.message}`.red);
    return false;
  }
}

// Експортуємо функцію для використання в головному файлі
module.exports = {
  runMint
};

// Якщо скрипт запущено напряму, виконуємо основну функцію
if (require.main === module) {
  // Отримуємо гаманці з конфігурації
  const wallets = config.WALLETS;
  
  // Отримуємо проксі з конфігурації
  const proxies = config.PROXIES;

  if (wallets.length === 0 || proxies.length === 0) {
    console.error('Please ensure WALLETS and PROXIES are configured in config.js'.red);
    process.exit(1);
  }

  async function main() {
    console.log(`Starting MagicEden NFT minting operations for all accounts...`);

    // Виконуємо операції для кожного гаманця
    for (let i = 0; i < wallets.length; i++) {
      const privateKey = wallets[i].trim();
      const proxy = proxies[i % proxies.length].trim();

      try {
        const provider = createProvider(proxy);
        const wallet = new ethers.Wallet(privateKey, provider);

        console.log(
          `\nStarting operations for account ${wallet.address} using proxy ${proxy}`
            .cyan
        );

        await runMint(wallet, proxy);
      } catch (error) {
        console.error(`❌ Error with wallet ${i+1}: ${error.message}`.red);
      }
      
      // Додаємо затримку між гаманцями
      if (i < wallets.length - 1) {
        console.log(`\nMoving to next wallet...`.cyan);
        await delay(config.DELAYS.MIN_WALLET_DELAY, config.DELAYS.MAX_WALLET_DELAY);
      }
    }

    console.log(`\nAll operations completed successfully!`.green.bold);
  }

  main().catch((error) => {
    console.error('Error occurred:', error);
  });
} 