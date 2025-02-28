require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const axios = require('axios');

// Константи для мережі Monad
const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const EXPLORER_URL = 'https://testnet.monadexplorer.com/tx/';

// Адреси контрактів на Monad тестнеті
const CONTRACTS = {
  // Базові токени
  WMON: '0x4200000000000000000000000000000000000023',
  USDC: '0x4200000000000000000000000000000000000022',
  
  // DEX роутери
  AMBIENT_ROUTER: '0x5615CDAb10dc425a742d643d949a7F474C01abc4',
  UNISWAP_ROUTER: '0x4200000000000000000000000000000000000020',
  VELOCORE_ROUTER: '0x1f3a7c8c766ef9e1ee7cca4523b303bd5b75f6d3',
  SYMBIOTIC_ROUTER: '0x2f3a7c8c766ef9e1ee7cca4523b303bd5b75f6d4',
  
  // Стейкінг контракти
  MAGMA_STAKING: '0x3f3a7c8c766ef9e1ee7cca4523b303bd5b75f6d5',
  APRIORI_STAKING: '0x4f3a7c8c766ef9e1ee7cca4523b303bd5b75f6d6',
  
  // Інші сервіси
  MONAD_BRIDGE: '0x5f3a7c8c766ef9e1ee7cca4523b303bd5b75f6d7',
  MONAD_NAME_SERVICE: '0x3019BF1dfB84E5b46Ca9D0eEC37dE08a59A41308',
  NFT_MARKETPLACE: '0x7f3a7c8c766ef9e1ee7cca4523b303bd5b75f6d9',
  MONAD_LENDING: '0x8f3a7c8c766ef9e1ee7cca4523b303bd5b75f6da'
};

// Мінімальні суми для операцій
const MIN_AMOUNTS = {
  SWAP: ethers.utils.parseEther('0.02'),
  LIQUIDITY: ethers.utils.parseEther('0.01'),
  STAKE: ethers.utils.parseEther('0.05'),
  BRIDGE: ethers.utils.parseEther('0.1')
};

// Функція для створення затримки
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Функція для отримання випадкової затримки між min та max секунд
function getRandomDelay(min = 30, max = 60) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000; // конвертуємо в мілісекунди
}

// Функція для виведення інформації про затримку
async function delay(min = 30, max = 60) {
  const delayTime = getRandomDelay(min, max);
  console.log(`⏳ Waiting for ${delayTime / 1000} seconds...`.yellow);
  await sleep(delayTime);
  console.log(`✅ Delay completed`.green);
}

// Функція для отримання випадкової суми MON між min та max
function getRandomAmount(min = 0.01, max = 0.05) {
  const randomAmount = Math.random() * (max - min) + min;
  return ethers.utils.parseEther(randomAmount.toFixed(6));
}

// Функція для перевірки балансу гаманця
async function checkWalletBalance(privateKey, proxy = null) {
  try {
    let provider;
    
    if (proxy) {
      provider = new ethers.providers.JsonRpcProvider({
        url: RPC_URL,
        headers: {
          'Proxy-Authorization': `Basic ${Buffer.from(
            proxy.split('@')[0]
          ).toString('base64')}`,
        },
      });
    } else {
      provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    }

    const wallet = new ethers.Wallet(privateKey, provider);
    const balance = await wallet.getBalance();
    
    return {
      wallet,
      provider,
      address: wallet.address,
      balance,
      hasEnoughBalance: balance.gt(0)
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

// Функція для обгортання MON в WMON
async function wrapMON(wallet, amount) {
  try {
    console.log(`Wrapping ${ethers.utils.formatEther(amount)} MON to WMON...`.cyan);
    
    // ABI для WMON (спрощений)
    const wmonAbi = [
      'function deposit() external payable'
    ];
    
    const wmonContract = new ethers.Contract(CONTRACTS.WMON, wmonAbi, wallet);
    
    // Відправляємо транзакцію для обгортання MON
    const tx = await wmonContract.deposit({ value: amount });
    console.log(`Transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block ${receipt.blockNumber}`.green);
    
    return true;
  } catch (error) {
    console.error(`Error wrapping MON: ${error.message}`.red);
    return false;
  }
}

// Функція для схвалення токенів для контракту
async function approveToken(wallet, tokenAddress, amount, spender) {
  try {
    console.log(`Approving ${ethers.utils.formatEther(amount)} tokens for ${spender}...`.cyan);
    
    // ABI для ERC20 токенів (спрощений)
    const erc20Abi = [
      'function approve(address spender, uint256 amount) external returns (bool)'
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
    
    // Відправляємо транзакцію для схвалення токенів
    const tx = await tokenContract.approve(spender, ethers.constants.MaxUint256);
    console.log(`Approval transaction sent: ${tx.hash}`.green);
    console.log(`View on explorer: ${EXPLORER_URL}${tx.hash}`.blue);
    
    // Чекаємо підтвердження транзакції
    const receipt = await tx.wait();
    console.log(`Approval confirmed in block ${receipt.blockNumber}`.green);
    
    return true;
  } catch (error) {
    console.error(`Error approving token: ${error.message}`.red);
    return false;
  }
}

// Функція для отримання балансу ERC20 токена
async function getTokenBalance(wallet, tokenAddress) {
  try {
    // ABI для ERC20 токенів (спрощений)
    const erc20Abi = [
      'function balanceOf(address account) external view returns (uint256)'
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet.provider);
    const balance = await tokenContract.balanceOf(wallet.address);
    
    return balance;
  } catch (error) {
    console.error(`Error getting token balance: ${error.message}`.red);
    return ethers.BigNumber.from(0);
  }
}

// Функція для форматування суми токена з правильною кількістю десяткових знаків
function formatTokenAmount(amount, decimals = 18) {
  return ethers.utils.formatUnits(amount, decimals);
}

// Функція для парсингу суми токена з правильною кількістю десяткових знаків
function parseTokenAmount(amount, decimals = 18) {
  return ethers.utils.parseUnits(amount.toString(), decimals);
}

// Експортуємо функції та константи
module.exports = {
  RPC_URL,
  EXPLORER_URL,
  CONTRACTS,
  MIN_AMOUNTS,
  sleep,
  getRandomDelay,
  delay,
  getRandomAmount,
  checkWalletBalance,
  wrapMON,
  approveToken,
  getTokenBalance,
  formatTokenAmount,
  parseTokenAmount
}; 