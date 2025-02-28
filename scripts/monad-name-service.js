const { ethers } = require('ethers');
const colors = require('colors');
const prompts = require('prompts');
const utils = require('./utils');

// Адреси контрактів
// Використовуємо адресу NNS (Nad Name Service) з utils.js
// Документація: https://docs.nad.domains/
const NNS_REGISTRY = utils.CONTRACTS.MONAD_NAME_SERVICE;

// Мінімальна сума для реєстрації домену
const MIN_REGISTRATION_AMOUNT = ethers.utils.parseEther('0.05');

// Доступні домени верхнього рівня
const TOP_LEVEL_DOMAINS = ['.nad'];

// Функція для перевірки доступності домену
async function checkDomainAvailability(wallet, domainName) {
  try {
    console.log(`Checking availability of domain: ${domainName}...`.cyan);
    
    // ABI для NNS Registry (на основі ENS та інших доменних сервісів)
    const nnsAbi = [
      'function available(string memory name) external view returns (bool)',
      'function isAvailable(string memory name) external view returns (bool)',
      'function checkAvailability(string memory name) external view returns (bool)',
      'function exists(string memory name) external view returns (bool)',
      'function recordExists(string memory name) external view returns (bool)'
    ];
    
    const nnsContract = new ethers.Contract(NNS_REGISTRY, nnsAbi, wallet);
    
    // Спробуємо різні методи для перевірки доступності
    let isAvailable = false;
    let methodFound = false;
    
    // Метод 1: available
    try {
      console.log(`Trying method 'available'...`.yellow);
      isAvailable = await nnsContract.available(domainName);
      methodFound = true;
      console.log(`Method 'available' succeeded`.green);
    } catch (e) {
      console.log(`Method 'available' failed: ${e.message}`.yellow);
    }
    
    // Метод 2: isAvailable
    if (!methodFound) {
      try {
        console.log(`Trying method 'isAvailable'...`.yellow);
        isAvailable = await nnsContract.isAvailable(domainName);
        methodFound = true;
        console.log(`Method 'isAvailable' succeeded`.green);
      } catch (e) {
        console.log(`Method 'isAvailable' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 3: checkAvailability
    if (!methodFound) {
      try {
        console.log(`Trying method 'checkAvailability'...`.yellow);
        isAvailable = await nnsContract.checkAvailability(domainName);
        methodFound = true;
        console.log(`Method 'checkAvailability' succeeded`.green);
      } catch (e) {
        console.log(`Method 'checkAvailability' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 4: exists (інвертуємо результат)
    if (!methodFound) {
      try {
        console.log(`Trying method 'exists'...`.yellow);
        const exists = await nnsContract.exists(domainName);
        isAvailable = !exists;
        methodFound = true;
        console.log(`Method 'exists' succeeded`.green);
      } catch (e) {
        console.log(`Method 'exists' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 5: recordExists (інвертуємо результат)
    if (!methodFound) {
      try {
        console.log(`Trying method 'recordExists'...`.yellow);
        const exists = await nnsContract.recordExists(domainName);
        isAvailable = !exists;
        methodFound = true;
        console.log(`Method 'recordExists' succeeded`.green);
      } catch (e) {
        console.log(`Method 'recordExists' failed: ${e.message}`.yellow);
      }
    }
    
    if (!methodFound) {
      console.log(`Could not find a valid method to check domain availability`.red);
      return false;
    }
    
    if (isAvailable) {
      console.log(`Domain ${domainName} is available!`.green);
    } else {
      console.log(`Domain ${domainName} is already taken.`.red);
    }
    
    return isAvailable;
  } catch (error) {
    console.error(`Error checking domain availability: ${error.message}`.red);
    return false;
  }
}

// Функція для отримання ціни реєстрації домену
async function getDomainPrice(wallet, domainName, registrationYears = 1) {
  try {
    console.log(`Getting price for domain: ${domainName} (${registrationYears} years)...`.cyan);
    
    // ABI для NNS Registry (на основі ENS та інших доменних сервісів)
    const nnsAbi = [
      'function rentPrice(string memory name, uint256 duration) external view returns (uint256)',
      'function price(string memory name, uint256 duration) external view returns (uint256)',
      'function getPrice(string memory name, uint256 duration) external view returns (uint256)',
      'function getDomainPrice(string memory name, uint256 duration) external view returns (uint256)',
      'function registrationFee(string memory name, uint256 duration) external view returns (uint256)',
      'function calculatePrice(string memory name, uint256 duration) external view returns (uint256)'
    ];
    
    const nnsContract = new ethers.Contract(NNS_REGISTRY, nnsAbi, wallet);
    
    // Тривалість реєстрації в секундах (1 рік = 31536000 секунд)
    const duration = registrationYears * 31536000;
    
    // Спробуємо різні методи для отримання ціни
    let price;
    let methodFound = false;
    
    // Метод 1: rentPrice
    try {
      console.log(`Trying method 'rentPrice'...`.yellow);
      price = await nnsContract.rentPrice(domainName, duration);
      methodFound = true;
      console.log(`Method 'rentPrice' succeeded`.green);
    } catch (e) {
      console.log(`Method 'rentPrice' failed: ${e.message}`.yellow);
    }
    
    // Метод 2: price
    if (!methodFound) {
      try {
        console.log(`Trying method 'price'...`.yellow);
        price = await nnsContract.price(domainName, duration);
        methodFound = true;
        console.log(`Method 'price' succeeded`.green);
      } catch (e) {
        console.log(`Method 'price' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 3: getPrice
    if (!methodFound) {
      try {
        console.log(`Trying method 'getPrice'...`.yellow);
        price = await nnsContract.getPrice(domainName, duration);
        methodFound = true;
        console.log(`Method 'getPrice' succeeded`.green);
      } catch (e) {
        console.log(`Method 'getPrice' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 4: getDomainPrice
    if (!methodFound) {
      try {
        console.log(`Trying method 'getDomainPrice'...`.yellow);
        price = await nnsContract.getDomainPrice(domainName, duration);
        methodFound = true;
        console.log(`Method 'getDomainPrice' succeeded`.green);
      } catch (e) {
        console.log(`Method 'getDomainPrice' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 5: registrationFee
    if (!methodFound) {
      try {
        console.log(`Trying method 'registrationFee'...`.yellow);
        price = await nnsContract.registrationFee(domainName, duration);
        methodFound = true;
        console.log(`Method 'registrationFee' succeeded`.green);
      } catch (e) {
        console.log(`Method 'registrationFee' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 6: calculatePrice
    if (!methodFound) {
      try {
        console.log(`Trying method 'calculatePrice'...`.yellow);
        price = await nnsContract.calculatePrice(domainName, duration);
        methodFound = true;
        console.log(`Method 'calculatePrice' succeeded`.green);
      } catch (e) {
        console.log(`Method 'calculatePrice' failed: ${e.message}`.yellow);
      }
    }
    
    if (!methodFound) {
      console.log(`Could not find a valid method to get domain price, using fixed price`.yellow);
      return ethers.utils.parseEther('0.05').mul(registrationYears);
    }
    
    console.log(`Domain price: ${ethers.utils.formatEther(price)} MON`.green);
    return price;
  } catch (error) {
    console.error(`Error getting domain price: ${error.message}`.red);
    // Повертаємо фіксовану ціну в разі помилки
    return ethers.utils.parseEther('0.05').mul(registrationYears);
  }
}

// Функція для реєстрації домену
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
    const price = await getDomainPrice(wallet, domainName, registrationYears);
    
    // Перевіряємо баланс гаманця
    const balance = await wallet.getBalance();
    if (balance.lt(price)) {
      console.log(`Insufficient balance to register domain. Required: ${ethers.utils.formatEther(price)} MON, Available: ${ethers.utils.formatEther(balance)} MON`.red);
      return false;
    }
    
    // ABI для NNS Registry (на основі ENS та інших доменних сервісів)
    const nnsAbi = [
      'function register(string memory name, address owner, uint256 duration) external payable returns (uint256)',
      'function registerWithConfig(string memory name, address owner, uint256 duration, address resolver, address addr) external payable returns (uint256)',
      'function registerDomain(string memory name, uint256 duration) external payable returns (bool)',
      'function registerName(string memory name, uint256 duration) external payable returns (bool)',
      'function registerWithAddress(string memory name, address owner, uint256 duration, address resolver) external payable returns (uint256)',
      'function commit(string memory name) external returns (bytes32)',
      'function commitAndRegister(string memory name, address owner, uint256 duration) external payable returns (uint256)'
    ];
    
    const nnsContract = new ethers.Contract(NNS_REGISTRY, nnsAbi, wallet);
    
    // Тривалість реєстрації в секундах (1 рік = 31536000 секунд)
    const duration = registrationYears * 31536000;
    
    console.log(`Registering domain ${domainName} for ${registrationYears} years...`.yellow);
    
    // Спробуємо різні методи для реєстрації домену
    let tx;
    let methodFound = false;
    
    // Метод 1: register
    try {
      console.log(`Trying method 'register'...`.yellow);
      tx = await nnsContract.register(domainName, wallet.address, duration, { value: price });
      methodFound = true;
      console.log(`Method 'register' succeeded`.green);
    } catch (e) {
      console.log(`Method 'register' failed: ${e.message}`.yellow);
    }
    
    // Метод 2: registerWithConfig
    if (!methodFound) {
      try {
        console.log(`Trying method 'registerWithConfig'...`.yellow);
        tx = await nnsContract.registerWithConfig(domainName, wallet.address, duration, wallet.address, wallet.address, { value: price });
        methodFound = true;
        console.log(`Method 'registerWithConfig' succeeded`.green);
      } catch (e) {
        console.log(`Method 'registerWithConfig' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 3: registerDomain
    if (!methodFound) {
      try {
        console.log(`Trying method 'registerDomain'...`.yellow);
        tx = await nnsContract.registerDomain(domainName, duration, { value: price });
        methodFound = true;
        console.log(`Method 'registerDomain' succeeded`.green);
      } catch (e) {
        console.log(`Method 'registerDomain' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 4: registerName
    if (!methodFound) {
      try {
        console.log(`Trying method 'registerName'...`.yellow);
        tx = await nnsContract.registerName(domainName, duration, { value: price });
        methodFound = true;
        console.log(`Method 'registerName' succeeded`.green);
      } catch (e) {
        console.log(`Method 'registerName' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 5: registerWithAddress
    if (!methodFound) {
      try {
        console.log(`Trying method 'registerWithAddress'...`.yellow);
        tx = await nnsContract.registerWithAddress(domainName, wallet.address, duration, wallet.address, { value: price });
        methodFound = true;
        console.log(`Method 'registerWithAddress' succeeded`.green);
      } catch (e) {
        console.log(`Method 'registerWithAddress' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 6: commitAndRegister
    if (!methodFound) {
      try {
        console.log(`Trying method 'commitAndRegister'...`.yellow);
        tx = await nnsContract.commitAndRegister(domainName, wallet.address, duration, { value: price });
        methodFound = true;
        console.log(`Method 'commitAndRegister' succeeded`.green);
      } catch (e) {
        console.log(`Method 'commitAndRegister' failed: ${e.message}`.yellow);
      }
    }
    
    if (!methodFound) {
      throw new Error("Could not find a valid method to register domain");
    }
    
    console.log(`Transaction sent: ${tx.hash}`.yellow);
    console.log(`Waiting for confirmation...`.yellow);
    
    const receipt = await tx.wait();
    console.log(`Domain registration confirmed! Transaction: ${receipt.transactionHash}`.green);
    
    return true;
  } catch (error) {
    console.error(`Error registering domain: ${error.message}`.red);
    return false;
  }
}

// Функція для встановлення адреси для домену
async function setDomainAddress(wallet, domainName, address) {
  try {
    console.log(`\nSetting address for domain ${domainName}...`.cyan);
    
    // ABI для NNS Registry (на основі ENS та інших доменних сервісів)
    const nnsAbi = [
      'function setAddr(string memory name, address addr) external returns (bool)',
      'function setAddress(string memory name, address addr) external returns (bool)',
      'function setResolver(string memory name, address resolver) external returns (bool)',
      'function setDomainAddress(string memory name, address addr) external returns (bool)',
      'function setRecord(string memory name, address addr) external returns (bool)',
      'function setNameRecord(string memory name, address addr) external returns (bool)'
    ];
    
    const nnsContract = new ethers.Contract(NNS_REGISTRY, nnsAbi, wallet);
    
    // Спробуємо різні методи для встановлення адреси
    let tx;
    let methodFound = false;
    
    // Метод 1: setAddr
    try {
      console.log(`Trying method 'setAddr'...`.yellow);
      tx = await nnsContract.setAddr(domainName, address);
      methodFound = true;
      console.log(`Method 'setAddr' succeeded`.green);
    } catch (e) {
      console.log(`Method 'setAddr' failed: ${e.message}`.yellow);
    }
    
    // Метод 2: setAddress
    if (!methodFound) {
      try {
        console.log(`Trying method 'setAddress'...`.yellow);
        tx = await nnsContract.setAddress(domainName, address);
        methodFound = true;
        console.log(`Method 'setAddress' succeeded`.green);
      } catch (e) {
        console.log(`Method 'setAddress' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 3: setResolver
    if (!methodFound) {
      try {
        console.log(`Trying method 'setResolver'...`.yellow);
        tx = await nnsContract.setResolver(domainName, address);
        methodFound = true;
        console.log(`Method 'setResolver' succeeded`.green);
      } catch (e) {
        console.log(`Method 'setResolver' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 4: setDomainAddress
    if (!methodFound) {
      try {
        console.log(`Trying method 'setDomainAddress'...`.yellow);
        tx = await nnsContract.setDomainAddress(domainName, address);
        methodFound = true;
        console.log(`Method 'setDomainAddress' succeeded`.green);
      } catch (e) {
        console.log(`Method 'setDomainAddress' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 5: setRecord
    if (!methodFound) {
      try {
        console.log(`Trying method 'setRecord'...`.yellow);
        tx = await nnsContract.setRecord(domainName, address);
        methodFound = true;
        console.log(`Method 'setRecord' succeeded`.green);
      } catch (e) {
        console.log(`Method 'setRecord' failed: ${e.message}`.yellow);
      }
    }
    
    // Метод 6: setNameRecord
    if (!methodFound) {
      try {
        console.log(`Trying method 'setNameRecord'...`.yellow);
        tx = await nnsContract.setNameRecord(domainName, address);
        methodFound = true;
        console.log(`Method 'setNameRecord' succeeded`.green);
      } catch (e) {
        console.log(`Method 'setNameRecord' failed: ${e.message}`.yellow);
      }
    }
    
    if (!methodFound) {
      throw new Error("Could not find a valid method to set domain address");
    }
    
    console.log(`Transaction sent: ${tx.hash}`.yellow);
    console.log(`Waiting for confirmation...`.yellow);
    
    const receipt = await tx.wait();
    console.log(`Address set successfully! Transaction: ${receipt.transactionHash}`.green);
    
    return true;
  } catch (error) {
    console.error(`Error setting domain address: ${error.message}`.red);
    return false;
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
      console.error(`Insufficient balance. You need at least ${ethers.utils.formatEther(MIN_REGISTRATION_AMOUNT)} MON`.red);
      return false;
    }
    
    // Генеруємо випадкове ім'я домену
    const randomName = `monad${Math.floor(Math.random() * 10000)}`;
    const randomTLD = TOP_LEVEL_DOMAINS[Math.floor(Math.random() * TOP_LEVEL_DOMAINS.length)];
    const domainName = randomName + randomTLD;
    
    console.log(`Generated random domain name: ${domainName}`.yellow);
    
    // Затримка перед початком операції
    if (useDelay) {
      await utils.delay(5, 10);
    }
    
    // Реєструємо домен
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
  
  // Запитуємо кількість років реєстрації
  const yearsResponse = await prompts({
    type: 'number',
    name: 'years',
    message: 'Enter registration period in years:',
    initial: 1,
    min: 1,
    max: 10
  });
  
  if (!yearsResponse.years) {
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
  
  // Реєструємо домен
  const result = await registerDomain(
    selectedWallet.wallet,
    domainName,
    yearsResponse.years
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