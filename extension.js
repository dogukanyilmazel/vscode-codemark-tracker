const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const fsPromises = require('fs').promises;

let lastEditDecoration = null;
const storageFilePath = path.join(__dirname, 'lastEditPosition.json');
const lastOpenedFilePath = path.join(__dirname, 'lastOpenedFile.json');

function activate(context) {
    if (vscode.window.activeTextEditor) {
        const editor = vscode.window.activeTextEditor;
        const filePath = editor.document.uri.fsPath;

        loadAndDecorateLastPosition(editor, filePath, context);
        showLastOpenedFile();
    }

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(async (event) => {
            const editor = vscode.window.activeTextEditor;
            if (editor && isSupportedLanguage(editor.document)) {
                const position = editor.selection.active;
                const filePath = editor.document.uri.fsPath;

                try {
                    await saveLastEditPosition(filePath, position);
                    console.log(`Last edit position updated: ${filePath}, Line: ${position.line}, Character: ${position.character}`);

                    await saveLastOpenedFile(filePath);
                    addDecoration(editor, position, context);

                } catch (error) {
                    console.error("Error updating last edit position on text change: ", error);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async (editor) => {
            if (editor && isSupportedLanguage(editor.document)) {
                const filePath = editor.document.uri.fsPath;
                await loadAndDecorateLastPosition(editor, filePath, context);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openLastFile', async () => {
            try {
                const data = await fsPromises.readFile(lastOpenedFilePath, 'utf8');
                const lastOpenedFile = JSON.parse(data).lastOpenedFile;

                if (lastOpenedFile) {
                    const documentUri = vscode.Uri.file(lastOpenedFile);

                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor && activeEditor.document.uri.fsPath === lastOpenedFile) {
                        console.log(`File is already active: ${lastOpenedFile}`);
                        await loadAndDecorateLastPosition(activeEditor, lastOpenedFile, context);
                    } else {
                        const visibleEditor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.fsPath === lastOpenedFile);
                        if (visibleEditor) {
                            console.log(`File is open but inactive, activating: ${lastOpenedFile}`);
                            const editor = await vscode.window.showTextDocument(visibleEditor.document);
                            await loadAndDecorateLastPosition(editor, lastOpenedFile, context);
                        } else {
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

async function saveLastEditPosition(filePath, position) {
    let positions = {};

    try {
        await fsPromises.access(storageFilePath).catch(() => {
            // Eğer dosya yoksa yeni bir dosya oluştur
            fsPromises.writeFile(storageFilePath, '{}');
        });

        const data = await fsPromises.readFile(storageFilePath, 'utf8');
        positions = JSON.parse(data);

        positions[filePath] = { line: position.line, character: position.character };

        await fsPromises.writeFile(storageFilePath, JSON.stringify(positions, null, 2));
        console.log('Last edit position saved successfully!');
    } catch (error) {
        console.error('Error saving last edit position:', error);
    }
}

async function loadLastEditPosition(filePath) {
    try {
        await fsPromises.access(storageFilePath).catch(() => {
            console.error('No storage file found.');
            return null;
        });

        const data = await fsPromises.readFile(storageFilePath, 'utf8');
        const positions = JSON.parse(data);

        if (positions[filePath]) {
            return positions[filePath];
        }
    } catch (error) {
        console.error('Error loading last edit position:', error);
    }
    return null;
}

async function loadAndDecorateLastPosition(editor, filePath, context) {
    const lastEdit = await loadLastEditPosition(filePath);
    if (lastEdit) {
        const position = new vscode.Position(lastEdit.line, lastEdit.character);
        const range = new vscode.Range(position, position);

        try {
            addDecoration(editor, position, context);

            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

            console.log(`Last edit position revealed: ${filePath}, Line: ${lastEdit.line}, Character: ${lastEdit.character}`);
        } catch (error) {
            console.error("Error revealing last edit position: ", error);
        }
    }
}

function addDecoration(editor, position, context) {
    const decorationType = vscode.window.createTextEditorDecorationType({
        gutterIconPath: vscode.Uri.file(context.asAbsolutePath('images/dot.png')),
        gutterIconSize: '28px' // İkonun boyutunu ayarlayın
    });

    const range = new vscode.Range(position, position);
    editor.setDecorations(decorationType, [range]);

    if (lastEditDecoration) {
        lastEditDecoration.dispose();
    }
    lastEditDecoration = decorationType;
}

async function saveLastOpenedFile(filePath) {
    try {
        await fsPromises.writeFile(lastOpenedFilePath, JSON.stringify({ lastOpenedFile: filePath }, null, 2));
        console.log(`Last opened file saved: ${filePath}`);
    } catch (error) {
        console.error('Error saving last opened file:', error);
    }
}

async function showLastOpenedFile() {
    try {
        await fsPromises.access(lastOpenedFilePath).catch(async () => {
            console.log('No lastOpenedFile.json found, creating a new one...');
            await fsPromises.writeFile(lastOpenedFilePath, '{}');
        });

        const data = await fsPromises.readFile(lastOpenedFilePath, 'utf8');
        const lastOpened = JSON.parse(data).lastOpenedFile;

        if (lastOpened) {
            vscode.window.setStatusBarMessage(`Last opened file: ${lastOpened}`, 10000);
            console.log(`Last opened file: ${lastOpened}`);
        }
    } catch (error) {
        console.error('Error loading last opened file:', error);
    }
}

function isSupportedLanguage(document) {
    const supportedLanguages = [
        'html',
        'php',
        'vue',
        'javascript',
        'typescript',
        'python',
        'java',
        'csharp',
        'cpp', // C++
        'css',
        'scss',
        'ruby',
        'go',
        'rust',
        'json',
        'yaml',
        'markdown'
    ]; 
    const languageId = document.languageId;
    return supportedLanguages.includes(languageId);
}

function deactivate() { }

module.exports = {
    activate,
    deactivate
};
