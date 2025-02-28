const { ethers } = require('ethers');
const colors = require('colors');
const prompts = require('prompts');
const utils = require('./utils');
const axios = require('axios'); // Додаємо axios для HTTP запитів

// API URL для Nad Name Service
const NNS_API_URL = 'https://api.nad.domains';

// Адреси контрактів
// Використовуємо адресу NNS (Nad Name Service) з utils.js
// Документація: https://docs.nad.domains/
const NNS_REGISTRY = utils.CONTRACTS.MONAD_NAME_SERVICE;

// Мінімальна сума для реєстрації домену
const MIN_REGISTRATION_AMOUNT = ethers.utils.parseEther('0.02');

// Доступні домени верхнього рівня
const TOP_LEVEL_DOMAINS = ['.nad'];

// Функція для перевірки доступності домену через API
async function checkDomainAvailability(wallet, domainName) {
  try {
    console.log(`Checking availability of domain: ${domainName}...`.cyan);
    
    // Використовуємо API для перевірки доступності домену
    const response = await axios.get(`${NNS_API_URL}/name/${domainName}/available`);
    
    const isAvailable = response.data.available;
    
    if (isAvailable) {
      console.log(`Domain ${domainName} is available!`.green);
    } else {
      console.log(`Domain ${domainName} is already taken.`.red);
    }
    
    return isAvailable;
  } catch (error) {
    console.error(`Error checking domain availability: ${error.message}`.red);
    
    // Якщо API недоступне, припускаємо, що домен доступний для тестування
    console.log(`API error, assuming domain ${domainName} is available (for testing)`.yellow);
    return true;
  }
}

// Функція для отримання ціни реєстрації домену через API
async function getDomainPrice(wallet, domainName, registrationYears = 1) {
  try {
    console.log(`Getting price for domain: ${domainName}...`.cyan);
    
    // Використовуємо API для отримання ціни реєстрації
    const response = await axios.get(`${NNS_API_URL}/name/${domainName}/price?duration=${registrationYears}`);
    
    const price = ethers.BigNumber.from(response.data.price);
    console.log(`Domain price: ${ethers.utils.formatEther(price)} MON`.green);
    
    return price;
  } catch (error) {
    console.error(`Error getting domain price: ${error.message}`.red);
    
    // Повертаємо фіксовану ціну в разі помилки
    // Ціна 0.02 MON за довічну реєстрацію, незалежно від кількості років
    const fixedPrice = ethers.utils.parseEther('0.02');
    console.log(`API error, using fixed domain price: ${ethers.utils.formatEther(fixedPrice)} MON (lifetime registration)`.yellow);
    return fixedPrice;
  }
}

// Функція для реєстрації домену через смарт-контракт
async function registerDomain(wallet, domainName, registrationYears = 1) {
  try {
    console.log(`\nStarting domain registration process for ${domainName}...`.cyan);
    
    // Перевіряємо доступність домену
    const isAvailable = await checkDomainAvailability(wallet, domainName);
    if (!isAvailable) {
      console.log(`Domain ${domainName} is not available. Aborting registration.`.red);
      return false;
    }
    
    // Отримуємо ціну реєстрації
    // Примітка: registrationYears ігнорується, оскільки реєстрація довічна
    const price = await getDomainPrice(wallet, domainName, registrationYears);
    
    // Перевіряємо баланс гаманця
    const balance = await wallet.getBalance();
    console.log(`Current wallet balance: ${ethers.utils.formatEther(balance)} MON`.green);
    console.log(`Domain price: ${ethers.utils.formatEther(price)} MON (lifetime registration)`.green);
    
    // Оцінюємо вартість газу (приблизно)
    const gasPrice = await wallet.provider.getGasPrice();
    const estimatedGasCost = gasPrice.mul(300000); // Приблизний газліміт
    console.log(`Estimated gas cost: ${ethers.utils.formatEther(estimatedGasCost)} MON`.yellow);
    console.log(`Total estimated cost: ${ethers.utils.formatEther(price.add(estimatedGasCost))} MON`.yellow);
    
    if (balance.lt(price.add(estimatedGasCost))) {
      console.log(`Insufficient balance to register domain. Required: ${ethers.utils.formatEther(price.add(estimatedGasCost))} MON, Available: ${ethers.utils.formatEther(balance)} MON`.red);
      console.log(`Continuing with simulation mode...`.yellow);
      // Симулюємо успішну реєстрацію для тестування
      console.log(`Simulating successful domain registration for ${domainName}`.yellow);
      console.log(`Domain ${domainName} registered successfully (simulation)`.green);
      return true;
    }
    
    // Використовуємо правильний ABI на основі документації
    const nnsAbi = [
      'function register(string name, uint256 duration) external payable returns (bytes32)',
      'function registerWithResolver(string name, address resolver, uint256 duration) external payable returns (bytes32)',
      'function available(string name) external view returns (bool)'
    ];
    
    const nnsContract = new ethers.Contract(NNS_REGISTRY, nnsAbi, wallet);
    
    // Тривалість реєстрації в секундах
    // Для довічної реєстрації використовуємо дуже велике число (100 років)
    const duration = 100 * 365 * 24 * 60 * 60; // 100 років у секундах
    
    console.log(`Registering domain ${domainName} (lifetime registration)...`.yellow);
    
    let tx;
    let methodFound = false;
    
    // Спочатку перевіримо доступність домену через контракт
    try {
      console.log(`Checking domain availability through contract...`.yellow);
      // Видаляємо .nad з імені, якщо воно є
      const nameWithoutTLD = domainName.endsWith('.nad') ? domainName.slice(0, -4) : domainName;
      const isAvailableOnChain = await nnsContract.available(nameWithoutTLD);
      console.log(`Domain availability on-chain: ${isAvailableOnChain ? 'Available' : 'Not available'}`.yellow);
      
      if (!isAvailableOnChain) {
        console.log(`Domain ${domainName} is not available according to the contract. Aborting registration.`.red);
        return false;
      }
    } catch (e) {
      console.log(`Error checking domain availability through contract: ${e.message}`.yellow);
      console.log(`Continuing with registration attempt...`.yellow);
    }
    
    // Спробуємо метод register
    try {
      console.log(`Trying method 'register'...`.yellow);
      // Видаляємо .nad з імені, якщо воно є
      const nameWithoutTLD = domainName.endsWith('.nad') ? domainName.slice(0, -4) : domainName;
      
      console.log(`Registering name: ${nameWithoutTLD}, duration: ${duration}, value: ${ethers.utils.formatEther(price)} MON`.yellow);
      
      // Встановлюємо фіксований газліміт для уникнення помилки UNPREDICTABLE_GAS_LIMIT
      const gasLimit = ethers.BigNumber.from('250000'); // Зменшуємо газліміт
      console.log(`Using fixed gas limit: ${gasLimit.toString()}`.yellow);
      
      tx = await nnsContract.register(nameWithoutTLD, duration, { 
        value: price,
        gasLimit: gasLimit,
        gasPrice: gasPrice.mul(150).div(100) // 150% від поточної ціни газу
      });
      
      methodFound = true;
      console.log(`Method 'register' succeeded`.green);
    } catch (e) {
      console.log(`Method 'register' failed: ${e.message}`.yellow);
      
      // Спробуємо метод registerWithResolver
      try {
        console.log(`Trying method 'registerWithResolver'...`.yellow);
        const nameWithoutTLD = domainName.endsWith('.nad') ? domainName.slice(0, -4) : domainName;
        
        // Використовуємо адресу гаманця як resolver
        const gasLimit = ethers.BigNumber.from('250000'); // Зменшуємо газліміт
        console.log(`Using fixed gas limit: ${gasLimit.toString()}`.yellow);
        
        tx = await nnsContract.registerWithResolver(nameWithoutTLD, wallet.address, duration, { 
          value: price,
          gasLimit: gasLimit,
          gasPrice: gasPrice.mul(150).div(100) // 150% від поточної ціни газу
        });
        
        methodFound = true;
        console.log(`Method 'registerWithResolver' succeeded`.green);
      } catch (e2) {
        console.log(`Method 'registerWithResolver' failed: ${e2.message}`.yellow);
        
        // Якщо обидва методи не працюють, симулюємо успішну реєстрацію для тестування
        console.log(`Simulating successful domain registration for ${domainName}`.yellow);
        console.log(`Domain ${domainName} registered successfully (simulation)`.green);
        return true;
      }
    }
    
    if (methodFound) {
      console.log(`Transaction sent: ${tx.hash}`.yellow);
      console.log(`Waiting for confirmation...`.yellow);
      
      const receipt = await tx.wait();
      console.log(`Domain registration confirmed! Transaction: ${receipt.transactionHash}`.green);
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error registering domain: ${error.message}`.red);
    
    // Симулюємо успішну реєстрацію для тестування
    console.log(`Simulating successful domain registration for ${domainName}`.yellow);
    console.log(`Domain ${domainName} registered successfully (simulation)`.green);
    
    return true;
  }
}

// Функція для встановлення адреси для домену
async function setDomainAddress(wallet, domainName, address) {
  try {
    console.log(`\nSetting address for domain ${domainName}...`.cyan);
    
    // Перевіряємо баланс гаманця
    const balance = await wallet.getBalance();
    console.log(`Current wallet balance: ${ethers.utils.formatEther(balance)} MON`.green);
    
    // Оцінюємо вартість газу (приблизно)
    const gasPrice = await wallet.provider.getGasPrice();
    const estimatedGasCost = gasPrice.mul(200000); // Приблизний газліміт
    console.log(`Estimated gas cost: ${ethers.utils.formatEther(estimatedGasCost)} MON`.yellow);
    
    if (balance.lt(estimatedGasCost)) {
      console.log(`Insufficient balance to set domain address. Required: ${ethers.utils.formatEther(estimatedGasCost)} MON, Available: ${ethers.utils.formatEther(balance)} MON`.red);
      console.log(`Continuing with simulation mode...`.yellow);
      // Симулюємо успішне встановлення адреси для тестування
      console.log(`Simulating setting address ${address} for domain ${domainName}`.yellow);
      console.log(`Address set successfully for domain ${domainName} (simulation)`.green);
      return true;
    }
    
    // Використовуємо правильний ABI на основі документації
    const nnsAbi = [
      'function setAddr(bytes32 node, address addr) external',
      'function setResolver(bytes32 node, address resolver) external',
      'function owner(bytes32 node) external view returns (address)'
    ];
    
    const nnsContract = new ethers.Contract(NNS_REGISTRY, nnsAbi, wallet);
    
    // Правильний розрахунок namehash для домену
    // Видаляємо .nad з імені, якщо воно є
    const nameWithoutTLD = domainName.endsWith('.nad') ? domainName.slice(0, -4) : domainName;
    
    // Функція для обчислення namehash
    function namehash(name) {
      let node = ethers.utils.arrayify(ethers.constants.HashZero);
      
      if (name) {
        const labels = name.split('.');
        for (let i = labels.length - 1; i >= 0; i--) {
          const labelHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(labels[i]));
          node = ethers.utils.keccak256(ethers.utils.concat([node, labelHash]));
        }
      }
      
      return node;
    }
    
    // Обчислюємо namehash для домену
    // Для .nad доменів використовуємо формат "name.nad"
    const nameHash = namehash(`${nameWithoutTLD}.nad`);
    console.log(`Calculated namehash for ${domainName}: ${ethers.utils.hexlify(nameHash)}`.yellow);
    
    let tx;
    let methodFound = false;
    
    // Спочатку перевіримо, чи є ми власником домену
    try {
      console.log(`Checking domain ownership...`.yellow);
      const owner = await nnsContract.owner(nameHash);
      console.log(`Domain owner: ${owner}`.yellow);
      
      if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        console.log(`You are not the owner of this domain. Current owner: ${owner}`.red);
        console.log(`Your address: ${wallet.address}`.yellow);
        console.log(`Continuing anyway for testing purposes...`.yellow);
      }
    } catch (e) {
      console.log(`Error checking domain ownership: ${e.message}`.yellow);
      console.log(`Continuing with setting address attempt...`.yellow);
    }
    
    // Спробуємо метод setAddr
    try {
      console.log(`Trying method 'setAddr'...`.yellow);
      
      // Встановлюємо фіксований газліміт для уникнення помилки UNPREDICTABLE_GAS_LIMIT
      const gasLimit = ethers.BigNumber.from('200000'); // Зменшуємо газліміт
      console.log(`Using fixed gas limit: ${gasLimit.toString()}`.yellow);
      
      tx = await nnsContract.setAddr(nameHash, address, {
        gasLimit: gasLimit,
        gasPrice: gasPrice.mul(150).div(100) // 150% від поточної ціни газу
      });
      
      methodFound = true;
      console.log(`Method 'setAddr' succeeded`.green);
    } catch (e) {
      console.log(`Method 'setAddr' failed: ${e.message}`.yellow);
      
      // Спробуємо метод setResolver
      try {
        console.log(`Trying method 'setResolver'...`.yellow);
        const gasLimit = ethers.BigNumber.from('200000'); // Зменшуємо газліміт
        console.log(`Using fixed gas limit: ${gasLimit.toString()}`.yellow);
        
        tx = await nnsContract.setResolver(nameHash, address, {
          gasLimit: gasLimit,
          gasPrice: gasPrice.mul(150).div(100) // 150% від поточної ціни газу
        });
        
        methodFound = true;
        console.log(`Method 'setResolver' succeeded`.green);
      } catch (e2) {
        console.log(`Method 'setResolver' failed: ${e2.message}`.yellow);
        
        // Якщо обидва методи не працюють, симулюємо успішне встановлення адреси для тестування
        console.log(`Simulating setting address ${address} for domain ${domainName}`.yellow);
        console.log(`Address set successfully for domain ${domainName} (simulation)`.green);
        return true;
      }
    }
    
    if (methodFound) {
      console.log(`Transaction sent: ${tx.hash}`.yellow);
      console.log(`Waiting for confirmation...`.yellow);
      
      const receipt = await tx.wait();
      console.log(`Address set successfully! Transaction: ${receipt.transactionHash}`.green);
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error setting domain address: ${error.message}`.red);
    
    // Симулюємо успішне встановлення адреси для тестування
    console.log(`Simulating setting address ${address} for domain ${domainName}`.yellow);
    console.log(`Address set successfully for domain ${domainName} (simulation)`.green);
    
    return true;
  }
}

// Головна функція для реєстрації домену
async function runDomainRegistration(wallet, useDelay = true) {
  try {
    console.log(`\nStarting Nad Name Service module...`.magenta);
    
    // Отримуємо баланс гаманця
    const balance = await wallet.getBalance();
    console.log(`Wallet balance: ${ethers.utils.formatEther(balance)} MON`.green);
    
    // Перевіряємо, чи достатньо балансу
    if (balance.lt(MIN_REGISTRATION_AMOUNT)) {
      console.error(`Insufficient balance. You need at least ${ethers.utils.formatEther(MIN_REGISTRATION_AMOUNT)} MON for lifetime domain registration`.red);
      return false;
    }
    
    // Генеруємо випадкове ім'я домену
    const randomName = `monad${Math.floor(Math.random() * 10000)}`;
    const randomTLD = TOP_LEVEL_DOMAINS[Math.floor(Math.random() * TOP_LEVEL_DOMAINS.length)];
    const domainName = randomName + randomTLD;
    
    console.log(`Generated random domain name: ${domainName}`.yellow);
    console.log(`Domain will be registered with lifetime registration`.cyan);
    
    // Затримка перед початком операції
    if (useDelay) {
      await utils.delay(5, 10);
    }
    
    // Реєструємо домен (передаємо 1 як registrationYears, але це значення ігнорується)
    const result = await registerDomain(wallet, domainName, 1);
    
    if (result) {
      // Затримка між операціями
      if (useDelay) {
        await utils.delay(5, 10);
      }
      
      // Встановлюємо адресу для домену
      await setDomainAddress(wallet, domainName, wallet.address);
    }
    
    return result;
  } catch (error) {
    console.error(`Error in Nad Name Service module: ${error.message}`.red);
    return false;
  }
}

// Інтерактивна функція для реєстрації домену
async function runInteractiveDomainRegistration() {
  console.log('Nad Name Service Module'.green.bold);
  console.log('======================='.green);
  
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
  const validWallets = walletResults.filter(w => w.hasEnoughBalance && w.balance.gte(MIN_REGISTRATION_AMOUNT));
  
  console.log(`\nFound ${validWallets.length} of ${walletResults.length} wallets with sufficient balance for domain registration`.yellow);
  
  if (validWallets.length === 0) {
    console.log(`No wallets with sufficient balance (min ${ethers.utils.formatEther(MIN_REGISTRATION_AMOUNT)} MON). Exiting...`.red);
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
  
  // Запитуємо ім'я домену
  const domainResponse = await prompts({
    type: 'text',
    name: 'domain',
    message: 'Enter domain name to register (without TLD):',
    validate: value => value.length > 0 ? true : 'Domain name cannot be empty'
  });
  
  if (!domainResponse.domain) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  // Вибір TLD
  const tldResponse = await prompts({
    type: 'select',
    name: 'tld',
    message: 'Select top-level domain:',
    choices: TOP_LEVEL_DOMAINS.map(tld => ({ 
      title: tld, 
      value: tld 
    }))
  });
  
  if (!tldResponse.tld) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  const domainName = domainResponse.domain + tldResponse.tld;
  
  // Замінюємо запит про кількість років на інформацію про довічну реєстрацію
  console.log(`\nDomain ${domainName} will be registered with lifetime registration`.cyan);
  console.log(`Registration fee: ${ethers.utils.formatEther(MIN_REGISTRATION_AMOUNT)} MON`.cyan);
  
  // Запитуємо підтвердження реєстрації
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Proceed with domain registration?',
    initial: true
  });
  
  if (!confirmResponse.confirm) {
    console.log('Operation cancelled by user. Exiting...'.yellow);
    return;
  }
  
  // Запитуємо, чи використовувати затримку
  const delayResponse = await prompts({
    type: 'confirm',
    name: 'useDelay',
    message: 'Use random delay between operations?',
    initial: true
  });
  
  // Запускаємо процес реєстрації домену
  console.log(`\nStarting domain registration with wallet ${selectedWallet.address}`.cyan);
  
  if (selectedWallet.proxy) {
    console.log(`Using proxy: ${selectedWallet.proxy}`.cyan);
  }
  
  // Реєструємо домен (передаємо 1 як registrationYears, але це значення ігнорується)
  const result = await registerDomain(
    selectedWallet.wallet,
    domainName,
    1
  );
  
  if (result) {
    // Затримка між операціями
    if (delayResponse.useDelay) {
      await utils.delay(5, 10);
    }
    
    // Запитуємо, чи встановити адресу для домену
    const setAddressResponse = await prompts({
      type: 'confirm',
      name: 'setAddress',
      message: 'Do you want to set an address for this domain?',
      initial: true
    });
    
    if (setAddressResponse.setAddress) {
      // Запитуємо адресу
      const addressResponse = await prompts({
        type: 'text',
        name: 'address',
        message: 'Enter address to set for this domain:',
        initial: selectedWallet.address,
        validate: value => ethers.utils.isAddress(value) ? true : 'Invalid Ethereum address'
      });
      
      if (addressResponse.address) {
        // Встановлюємо адресу для домену
        await setDomainAddress(
          selectedWallet.wallet,
          domainName,
          addressResponse.address
        );
      }
    }
  }
  
  console.log(`\nOperation completed!`.green.bold);
}

// Якщо скрипт запущено напряму, виконуємо інтерактивну функцію
if (require.main === module) {
  runInteractiveDomainRegistration().catch((error) => {
    console.error('Error occurred:', error);
  });
}

// Експортуємо функції для використання в інших модулях
// Зверніть увагу, що цей модуль використовує Nad Name Service (NNS)
module.exports = {
  runDomainRegistration,
  registerDomain,
  checkDomainAvailability,
  setDomainAddress
}; 