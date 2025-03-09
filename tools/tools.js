const colors = require('colors');
const { spawn } = require('child_process');
const prompts = require('prompts');
const path = require('path');

// Шлях до кореневої директорії проекту
const rootDir = path.resolve(__dirname, '..');

// Масив доступних інструментів
const tools = [
    { title: '🔍 Перевірити всі гаманці', value: 'check-wallets', command: 'node tools/check-wallets.js' },
    { title: '💰 Перезаправити гаманці', value: 'refill-wallets', command: 'node tools/refill-wallets.js' },
    { title: '🔌 Перевірити проксі-сервери', value: 'proxy-check', command: 'node tools/proxy-check.js' },
    { title: '🚀 Запустити головний скрипт', value: 'main', command: 'node main.js' },
    { title: '⚙️ Запустити Rubic модуль', value: 'rubic', command: 'node scripts/rubic-multi.js' },
    { title: '⚙️ Запустити Magma модуль', value: 'magma', command: 'node scripts/magma-multi.js' },
    { title: '⚙️ Запустити Izumi модуль', value: 'izumi', command: 'node scripts/izumi-multi.js' },
    { title: '⚙️ Запустити aPriori модуль', value: 'apriori', command: 'node scripts/apriori-multi.js' },
    { title: '🔄 Повернутися до меню після виконання команди', value: 'return', command: null }
];

// Функція для виконання команди
async function executeCommand(command) {
    return new Promise((resolve) => {
        console.log(`\n${colors.cyan('Виконуємо команду:')} ${colors.yellow(command)}\n`);
        
        const process = spawn(command, { shell: true, stdio: 'inherit' });
        
        process.on('close', (code) => {
            if (code === 0) {
                console.log(`\n${colors.green('✅ Команда успішно виконана')}`);
            } else {
                console.log(`\n${colors.red(`❌ Команда завершилась з кодом помилки: ${code}`)}`);
            }
            resolve();
        });
    });
}

// Головна функція
async function main() {
    let returnToMenu = false;
    
    while (true) {
        console.clear();
        console.log('\n' + colors.bold.green('=== МОНАД - ІНСТРУМЕНТИ ==='));
        console.log(colors.yellow(`Дата та час: ${new Date().toLocaleString()}`));
        
        const choices = [...tools];
        if (!returnToMenu) {
            // Видаляємо опцію повернення, якщо вона ще не вибрана
            choices.pop();
        }
        
        choices.push({ title: '❌ Вихід', value: 'exit' });
        
        const response = await prompts({
            type: 'select',
            name: 'tool',
            message: 'Оберіть інструмент:',
            choices: choices,
            initial: 0
        });
        
        if (!response.tool || response.tool === 'exit') {
            console.log('\n' + colors.yellow('До побачення!'));
            break;
        }
        
        const selectedTool = tools.find(t => t.value === response.tool);
        
        if (response.tool === 'return') {
            returnToMenu = !returnToMenu;
            console.log(`\n${colors.cyan('Повернення до меню')} ${returnToMenu ? colors.green('УВІМКНЕНО') : colors.red('ВИМКНЕНО')}`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            continue;
        }
        
        await executeCommand(selectedTool.command);
        
        if (!returnToMenu) {
            console.log('\n' + colors.cyan('Натисніть Enter, щоб повернутися до меню...'));
            await new Promise(resolve => {
                process.stdin.once('data', () => {
                    resolve();
                });
            });
        }
    }
}

// Запускаємо головну функцію
main().catch((error) => {
    console.error('Сталася помилка:', error);
}); 