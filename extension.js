const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const fsPromises = require('fs').promises;

let lastEditDecoration = null;
const storageFilePath = path.join(__dirname, 'lastEditPosition.json'); // Pozisyonların kaydedileceği dosya
const lastOpenedFilePath = path.join(__dirname, 'lastOpenedFile.json'); // Son açılan dosyanın kaydedileceği dosya

function activate(context) {
    // Eklenti açıldığında, aktif düzenleyici varsa son düzenlenen yeri ve son dosyayı yükleyelim
    if (vscode.window.activeTextEditor) {
        const editor = vscode.window.activeTextEditor;
        const filePath = editor.document.uri.fsPath;

        loadAndDecorateLastPosition(editor, filePath, context); // Pozisyonu yükleyip dekorasyonu ekleyelim
        showLastOpenedFile(); // Son açılan dosyayı statü barında gösterelim
    }

    // Dosya kaydedildiğinde veya değiştirildiğinde tetiklenecek olay
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && isSupportedLanguage(editor.document)) {
                const position = editor.selection.active;
                const filePath = editor.document.uri.fsPath;

                try {
                    // Son düzenlenen pozisyonu kalıcı olarak kaydet
                    await saveLastEditPosition(filePath, position);
                    console.log(`Last edit position updated: ${filePath}, Line: ${position.line}, Character: ${position.character}`);

                    // En son düzenlenen dosyayı kaydet
                    await saveLastOpenedFile(filePath);

                    // Dekorasyonu ekleyelim
                    addDecoration(editor, position, context);

                } catch (error) {
                    console.error("Error updating last edit position on text change: ", error);
                }
            }
        })
    );

    // Pencere açıldığında veya dosya aktif olduğunda en son düzenlenen yeri göstermek ve son açılan dosyayı kaydetmek için
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (editor && isSupportedLanguage(editor.document)) {
                const filePath = editor.document.uri.fsPath;
                await loadAndDecorateLastPosition(editor, filePath, context); // Pozisyonu yükleyip dekorasyonu ekleyelim
            }
        })
    );

    // Komut: En son açılan dosyayı açma
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openLastFile', async () => {
            try {
                const data = await fsPromises.readFile(lastOpenedFilePath, 'utf8');
                const lastOpenedFile = JSON.parse(data).lastOpenedFile;

                if (lastOpenedFile) {
                    // Dosya yolunu URI biçimine çeviriyoruz
                    const documentUri = vscode.Uri.file(lastOpenedFile);

                    // Açık ve aktif dosyaları kontrol edelim
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor && activeEditor.document.uri.fsPath === lastOpenedFile) {
                        // Eğer dosya zaten aktifse, sadece pozisyonu ve dekorasyonu güncelle
                        console.log(`File is already active: ${lastOpenedFile}`);
                        await loadAndDecorateLastPosition(activeEditor, lastOpenedFile, context);
                    } else {
                        // Eğer dosya açık ama aktif değilse, dosyayı aktif yapalım
                        const visibleEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.fsPath === lastOpenedFile);
                        if (visibleEditor) {
                            console.log(`File is open but inactive, activating: ${lastOpenedFile}`);
                            const editor = await vscode.window.showTextDocument(visibleEditor.document);
                            await loadAndDecorateLastPosition(editor, lastOpenedFile, context);
                        } else {
                            // Eğer dosya kapalıysa, dosyayı aç ve göster
                            console.log(`Opening file: ${lastOpenedFile}`);
                            const document = await vscode.workspace.openTextDocument(documentUri);
                            const editor = await vscode.window.showTextDocument(document);
                            await loadAndDecorateLastPosition(editor, lastOpenedFile, context);
                        }
                    }
                } else {
                    vscode.window.showInformationMessage('No last edited file found.');
                }
            } catch (error) {
                console.error('Error opening last edited file:', error);
                vscode.window.showErrorMessage('Failed to open last edited file.');
            }
        })
    );
}

// Son düzenlenen pozisyonu kaydetme (kalıcı JSON dosyasına)
async function saveLastEditPosition(filePath, position) {
    let positions = {};

    try {
        // Dosya var mı kontrolü
        await fsPromises.access(storageFilePath).catch(() => {
            // Eğer dosya yoksa yeni bir dosya oluştur
            fsPromises.writeFile(storageFilePath, '{}');
        });

        // Mevcut pozisyonları yükleyin
        const data = await fsPromises.readFile(storageFilePath, 'utf8');
        positions = JSON.parse(data);

        // Yeni pozisyonu ekleyin veya güncelleyin
        positions[filePath] = { line: position.line, character: position.character };

        // Güncellenmiş pozisyonları dosyaya yazın
        await fsPromises.writeFile(storageFilePath, JSON.stringify(positions, null, 2));
        console.log('Last edit position saved successfully!');
    } catch (error) {
        console.error('Error saving last edit position:', error);
    }
}

// Son düzenlenen pozisyonu yükleme (kalıcı JSON dosyasından) ve dekorasyonu ekleme
async function loadLastEditPosition(filePath) {
    try {
        await fsPromises.access(storageFilePath).catch(() => {
            console.error('No storage file found.');
            return null;
        });

        const data = await fsPromises.readFile(storageFilePath, 'utf8');
        const positions = JSON.parse(data);

        // İlgili dosya için kaydedilen pozisyonu döndür
        if (positions[filePath]) {
            return positions[filePath];
        }
    } catch (error) {
        console.error('Error loading last edit position:', error);
    }
    return null;
}

// Pozisyonu yükleyip dekorasyon ekleme
async function loadAndDecorateLastPosition(editor, filePath, context) {
    const lastEdit = await loadLastEditPosition(filePath);
    if (lastEdit) {
        const position = new vscode.Position(lastEdit.line, lastEdit.character);
        const range = new vscode.Range(position, position);

        try {
            // Dekorasyonu eklemek için gutter kullanımı
            addDecoration(editor, position, context); // context'i addDecoration fonksiyonuna geçiyoruz

            // İlgili konuma git
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

            console.log(`Last edit position revealed: ${filePath}, Line: ${lastEdit.line}, Character: ${lastEdit.character}`);
        } catch (error) {
            console.error("Error revealing last edit position: ", error);
        }
    }
}

// Dekorasyon ekleme fonksiyonu
function addDecoration(editor, position, context) {
    const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.file(context.asAbsolutePath('images/dot.png')),
        gutterIconSize: '28px' // İkonun boyutunu ayarlayın
    });

    const range = new vscode.Range(position, position);
    editor.setDecorations(decorationType, [range]);

    // Önceki dekorasyonu temizleyin
    if (lastEditDecoration) {
        lastEditDecoration.dispose();
    }
    lastEditDecoration = decorationType;
}

// Son açılan dosyayı kaydetme
async function saveLastOpenedFile(filePath) {
    try {
        await fsPromises.writeFile(lastOpenedFilePath, JSON.stringify({ lastOpenedFile: filePath }, null, 2));
        console.log(`Last opened file saved: ${filePath}`);
    } catch (error) {
        console.error('Error saving last opened file:', error);
    }
}

// Son açılan dosyayı gösterme (statü bar veya konsolda)
async function showLastOpenedFile() {
    try {
        // Dosya var mı kontrol et, yoksa boş bir dosya oluştur
        await fsPromises.access(lastOpenedFilePath).catch(async () => {
            console.log('No lastOpenedFile.json found, creating a new one...');
            await fsPromises.writeFile(lastOpenedFilePath, '{}');
        });

        const data = await fsPromises.readFile(lastOpenedFilePath, 'utf8');
        const lastOpened = JSON.parse(data).lastOpenedFile;

        if (lastOpened) {
            // Statü barında veya konsolda gösterelim
            vscode.window.setStatusBarMessage(`Last opened file: ${lastOpened}`, 10000); 
            console.log(`Last opened file: ${lastOpened}`);
        }
    } catch (error) {
        console.error('Error loading last opened file:', error);
    }
}

// Desteklenen dillerin kontrolü
function isSupportedLanguage(document) {
    const supportedLanguages = ['html', 'php', 'vue'];
    const languageId = document.languageId;
    return supportedLanguages.includes(languageId);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
