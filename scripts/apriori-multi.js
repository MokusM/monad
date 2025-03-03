require('dotenv').config();
const { ethers } = require('ethers');
const colors = require('colors');
const fs = require('fs');
const axios = require('axios');
const config = require('../config');

const RPC_URL = 'https://testnet-rpc.monad.xyz/';
const EXPLORER_URL = 'https://testnet.monadexplorer.com/tx/';
const WMON_CONTRACT = '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701';
const APRIORI_CONTRACT = '0xb2f82D0f38dc453D596Ad40A37799446Cc89274A';
const gasLimitClaim = 800000;

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
      WMON_CONTRACT,
      [
        'function deposit() public payable',
        'function withdraw(uint256 amount) public',
      ],
      wallet
    );
    const tx = await contract.deposit({ value: amount, gasLimit: 500000 });
    console.log(`✔️  Wrap MON → WMON successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${tx.hash}`.yellow);
    await tx.wait();
    return true;
  } catch (error) {
    console.error('❌ Error wrapping MON:'.red, error);
    return false;
  }
}

// Функція для стейкінгу MON в aPriori
async function stakeMON(wallet, amount) {
  try {
    console.log(
      `🔄 Staking ${ethers.utils.formatEther(amount)} MON in aPriori...`.magenta
    );
    
    // Використовуємо прямий виклик транзакції, як у apriori-thread.js
    const data =
      '0x6e553f65' +
      ethers.utils.hexZeroPad(amount.toHexString(), 32).slice(2) +
      ethers.utils.hexZeroPad(wallet.address, 32).slice(2);
    
    const tx = {
      to: APRIORI_CONTRACT,
      data: data,
      gasLimit: 500000,
      value: amount,
    };
    
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`✔️  Stake MON in aPriori successful`.green.underline);
    console.log(`➡️  Transaction sent: ${EXPLORER_URL}${txResponse.hash}`.yellow);
    await txResponse.wait();
    return true;
  } catch (error) {
    console.error('❌ Error staking MON:'.red, error);
    return false;
  }
}

// Функція для виконання одноразової операції стейкінгу
async function runStaking(wallet) {
  try {
    const randomAmount = getRandomAmount();
    console.log(`Starting aPriori staking operation:`.magenta);
    
    // Стейкаємо MON напряму (без обгортання в WMON)
    await stakeMON(wallet, randomAmount);
    
    console.log(`aPriori staking operation completed`.green);
    return true;
  } catch (error) {
    console.error(`❌ aPriori staking operation failed: ${error.message}`.red);
    return false;
  }
}

// Експортуємо функцію для використання в головному файлі
module.exports = {
  runStaking
};

// Якщо скрипт запущено напряму, виконуємо основну функцію
if (require.main === module) {
  // Читаємо список приватних ключів з файлу wallet.txt
  const wallets = fs
    .readFileSync('wallet.txt', 'utf8')
    .split('\n')
    .filter(Boolean);

  // Читаємо список проксі з файлу proxy.txt
  const proxies = fs
    .readFileSync('proxy.txt', 'utf8')
    .split('\n')
    .filter(Boolean);

  if (wallets.length === 0 || proxies.length === 0) {
    console.error('Please ensure wallet.txt and proxy.txt are not empty.'.red);
    process.exit(1);
  }

  async function main() {
    console.log(`Starting staking operations for all accounts...`);

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

      await runStaking(wallet);
      
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
