require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const config = require('../config');

const RPC_URL = config.RPC_URL;
const EXPLORER_URL = config.EXPLORER_URL;
const WMON_CONTRACT = config.CONTRACTS.WMON;

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

// Функція для отримання випадкової суми MON
function getRandomAmount() {
  const min = config.AMOUNTS.MIN_AMOUNT;
  const max = config.AMOUNTS.MAX_AMOUNT;
  const randomAmount = Math.random() * (max - min) + min;
  return ethers.utils.parseEther(randomAmount.toFixed(4));
}

// Функція для обгортання MON в WMON
async function wrapMON(wallet, amount) {
  try {
    console.log(
      `🔄 Wrapping ${ethers.utils.formatEther(amount)} MON into WMON...`.magenta
    );
    const contract = new ethers.Contract(
      config.CONTRACTS.WMON,
      [
        'function deposit() public payable',
        'function withdraw(uint256 amount) public',
      ],
      wallet
    );
    const tx = await contract.deposit({ 
      value: amount, 
      gasLimit: config.GAS.DEFAULT_GAS_LIMIT 
    });
    console.log(`✔️  Wrap MON → WMON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${config.EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('❌ Error wrapping MON:'.red, error);
    return false;
  }
}

// Функція для розгортання WMON назад в MON
async function unwrapMON(wallet, amount) {
  try {
    console.log(
      `🔄 Unwrapping ${ethers.utils.formatEther(amount)} WMON back to MON...`
        .magenta
    );
    const contract = new ethers.Contract(
      config.CONTRACTS.WMON,
      [
        'function deposit() public payable',
        'function withdraw(uint256 amount) public',
      ],
      wallet
    );
    const tx = await contract.withdraw(amount, { 
      gasLimit: config.GAS.DEFAULT_GAS_LIMIT 
    });
    console.log(`✔️  Unwrap WMON → MON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${config.EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('❌ Error unwrapping WMON:'.red, error);
    return false;
  }
}

// Функція перевірки балансу WMON
async function checkWMONBalance(wallet) {
  try {
    const contract = new ethers.Contract(
      config.CONTRACTS.WMON,
      ['function balanceOf(address account) external view returns (uint256)'],
      wallet
    );
    const balance = await contract.balanceOf(wallet.address);
    console.log(`💰 WMON Balance: ${ethers.utils.formatEther(balance)} WMON`.blue);
    return balance;
  } catch (error) {
    console.error('❌ Error checking WMON balance:'.red, error);
    return ethers.BigNumber.from(0);
  }
}

// Головна функція для виконання азаар операцій (тепер без симуляції - реальні транзакції)
async function runSwap(wallet) {
  try {
    const randomAmount = getRandomAmount();
    console.log(`Starting Azaar swap operation:`.magenta);
    
    // Отримуємо поточний баланс MON
    const monBalance = await wallet.getBalance();
    console.log(`💰 Current MON Balance: ${ethers.utils.formatEther(monBalance)} MON`.blue);
    
    // Обгортаємо MON в WMON
    const wrapSuccess = await wrapMON(wallet, randomAmount);
    
    if (wrapSuccess) {
      // Додаємо затримку між операціями
      await delay(); 
      
      // Перевіряємо баланс WMON після обгортання
      await checkWMONBalance(wallet);
      
      // Додаємо затримку між операціями
      await delay();
      
      // Розгортаємо WMON назад в MON
      await unwrapMON(wallet, randomAmount);
    }
    
    console.log(`Azaar swap operation completed`.green);
    return true;
  } catch (error) {
    console.error(`❌ Azaar swap operation failed: ${error.message}`.red);
    return false;
  }
}

// Експортуємо функцію для використання в головному файлі
module.exports = {
  runSwap
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
    console.log(`Starting Azaar operations for all accounts...`);

    // Виконуємо операції для кожного гаманця
    for (let i = 0; i < wallets.length; i++) {
      const privateKey = wallets[i].trim();
      const proxy = proxies[i % proxies.length].trim();

      const provider = new ethers.providers.JsonRpcProvider({
        url: RPC_URL,
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

      await runSwap(wallet);
      
      // Додаємо затримку між гаманцями
      if (i < wallets.length - 1) {
        console.log(`\nMoving to next wallet...`.cyan);
        await delay(); // Затримка згідно з конфігурацією
      }
    }

    console.log(`\nAll operations completed successfully!`.green.bold);
  }

  main().catch((error) => {
    console.error('Error occurred:', error);
  });
} 