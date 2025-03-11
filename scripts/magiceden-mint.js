/**
 * Модуль для мінтингу NFT на MagicEden в мережі Monad testnet
 * Адаптовано з репозиторію 0xStarLabs/StarLabs-Monad
 */

require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const config = require('../config');
const walletUtils = require('../utils/wallet-utils');

// Контракти NFT на MagicEden
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

// Функція для мінтингу NFT
async function mintNFT(wallet, nftContract, quantity = 1) {
  try {
    const contract = new ethers.Contract(nftContract, NFT_ABI, wallet);
    
    // Отримуємо ім'я колекції
    const name = await contract.name();
    console.log(`🖼️ Minting ${quantity} NFT from collection: ${name}`.magenta);
    
    // Отримуємо ціну мінтингу
    let mintingFee;
    try {
      mintingFee = await contract.mintingFee();
      console.log(`💰 Minting fee: ${ethers.utils.formatEther(mintingFee)} MON`.cyan);
    } catch (error) {
      console.log(`💰 Minting fee not available, assuming free mint`.cyan);
      mintingFee = ethers.BigNumber.from(0);
    }
    
    // Підготовка транзакції
    const tx = await contract.mint(quantity, {
      value: mintingFee.mul(quantity),
      gasLimit: 500000
    });
    
    console.log(`✔️ NFT mint transaction sent`.green.underline);
    console.log(`➡️ Transaction hash: ${tx.hash}`.yellow);
    
    // Очікуємо підтвердження транзакції
    const receipt = await tx.wait();
    
    // Перевіряємо баланс NFT після мінтингу
    const balance = await contract.balanceOf(wallet.address);
    
    console.log(`✅ NFT mint successful! Current balance: ${balance.toString()} NFTs`.green);
    return true;
  } catch (error) {
    console.error(`❌ Error minting NFT:`.red, error.message);
    return false;
  }
}

// Головна функція для мінтингу NFT
async function runMint(wallet) {
  try {
    console.log(`Starting MagicEden NFT minting operation:`.magenta);
    
    // Отримуємо випадковий контракт NFT
    const nftContract = getRandomNFTContract();
    
    // Визначаємо випадкову кількість NFT для мінтингу (1-3)
    const quantity = Math.floor(Math.random() * 3) + 1;
    
    // Мінтимо NFT
    await mintNFT(wallet, nftContract, quantity);
    
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

      const provider = new ethers.providers.JsonRpcProvider({
        url: config.RPC_URL,
        headers: {
          'Proxy-Authorization': `Basic ${Buffer.from(
            proxy.split('@')[0]
          ).toString('base64')}`,
        },
      });

      const wallet = new ethers.Wallet(privateKey, provider);

      console.log(
        `\nStarting operations for account ${wallet.address} using proxy ${proxy}`
          .cyan
      );

      await runMint(wallet);
      
      // Додаємо затримку між гаманцями
      if (i < wallets.length - 1) {
        console.log(`\nMoving to next wallet...`.cyan);
        await delay(60, 600); // Затримка 1-10 хвилин між гаманцями
      }
    }

    console.log(`\nAll operations completed successfully!`.green.bold);
  }

  main().catch((error) => {
    console.error('Error occurred:', error);
  });
} 