"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const player = require('play-sound').default || require('play-sound');
// Configuration for when to trigger roasting
const ROAST_CONFIG = {
    minLineCount: 5, // Minimum lines of code to consider roasting
    triggerInterval: 30000, // 30 seconds between potential roasts
    triggerOnKeywords: ['function', 'class', 'if', 'for', 'while', 'try', 'catch'], // Keywords that might trigger interest
    triggerOnPatterns: [/\/\*.*\*\//, /\/\/.*TODO/, /console\.log/, /debugger/, /alert\(/] // Patterns that trigger roasting
};
async function roastCode(code, apiKey) {
    try {
        const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: 'You are a witty code critic who randomly appears to roast code. Be funny, sarcastic, and constructive. Point out issues, suggest improvements, but keep it entertaining. Sometimes compliment good code too. Keep responses under 100 words.'
                },
                {
                    role: 'user',
                    content: `Here's some code I'm working on:\n\n${code}`
                }
            ],
            max_tokens: 300,
            temperature: 0.9
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.choices[0].message.content;
    }
    catch (error) {
        console.error('Code roasting failed:', error);
        return null; // Fail silently for background operation
    }
}
// Check if code is "interesting" enough to roast
function isCodeInteresting(code) {
    const lines = code.split('\n').filter(line => line.trim().length > 0);
    // Too short, not interesting
    if (lines.length < ROAST_CONFIG.minLineCount) {
        return false;
    }
    // Check for interesting patterns
    const codeText = code.toLowerCase();
    // Look for keywords that suggest complex logic
    const hasInterestingKeywords = ROAST_CONFIG.triggerOnKeywords.some(keyword => codeText.includes(keyword));
    // Look for potentially problematic patterns
    const hasProblematicPatterns = ROAST_CONFIG.triggerOnPatterns.some(pattern => pattern.test(code));
    // Random chance to roast (20% chance for any qualifying code)
    const randomTrigger = Math.random() < 0.2;
    return hasInterestingKeywords || hasProblematicPatterns || randomTrigger;
}
// Get current code context (selection or surrounding lines)
function getCurrentCodeContext(editor) {
    if (!editor.selection.isEmpty) {
        return editor.document.getText(editor.selection);
    }
    // Get current line and surrounding context
    const currentLine = editor.selection.active.line;
    const startLine = Math.max(0, currentLine - 5);
    const endLine = Math.min(editor.document.lineCount - 1, currentLine + 5);
    const range = new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length);
    return editor.document.getText(range);
}
// Helper: Convert text to speech using OpenAI TTS API
async function textToSpeech(roast, apiKey) {
    try {
        const response = await axios_1.default.post('https://api.openai.com/v1/audio/speech', {
            model: 'tts-1',
            input: roast,
            voice: 'alloy' // You can choose other voices: 'echo', 'fable', etc.
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
        });
        // Save audio to temp file
        const tempAudioPath = path.join(require('os').tmpdir(), `roast-${Date.now()}.mp3`);
        fs.writeFileSync(tempAudioPath, Buffer.from(response.data), 'binary');
        return tempAudioPath;
    }
    catch (error) {
        console.error('TTS failed:', error);
        return null;
    }
}
// Helper: Play audio file
function playAudio(filePath) {
    const audio = player();
    audio.play(filePath, (err) => {
        if (err)
            console.error('Audio playback failed:', err);
    });
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    console.log('🔥 Code Roaster extension is now active! Watching your code...');
    let lastRoastTime = 0;
    let apiKey;
    // Function to get or prompt for API key
    async function getApiKey() {
        if (apiKey) {
            return apiKey;
        }
        const config = vscode.workspace.getConfiguration('code-roaster');
        apiKey = config.get('OPENAIAPIKEY');
        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your OpenAI API Key for automatic code roasting',
                password: true,
                placeHolder: 'sk-...'
            });
            if (apiKey) {
                const saveKey = await vscode.window.showQuickPick(['Yes', 'No'], {
                    placeHolder: 'Save API key for future use?'
                });
                if (saveKey === 'Yes') {
                    await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
                }
            }
        }
        return apiKey;
    }
    // Function to attempt roasting current code
    async function attemptRoast(editor) {
        const now = Date.now();
        // Throttle roasting attempts
        if (now - lastRoastTime < ROAST_CONFIG.triggerInterval) {
            return;
        }
        const currentApiKey = await getApiKey();
        if (!currentApiKey) {
            return; // No API key, skip silently
        }
        const codeContext = getCurrentCodeContext(editor);
        if (!isCodeInteresting(codeContext)) {
            return; // Code not interesting enough
        }
        lastRoastTime = now;
        // Attempt to roast the code
        const roast = await roastCode(codeContext, currentApiKey);
        if (roast) {
            // Show a subtle notification with the roast
            vscode.window.showInformationMessage(`🔥 ${roast}`, 'Dismiss', 'Copy Roast', 'Play Roast Audio').then(async (selection) => {
                if (selection === 'Copy Roast') {
                    vscode.env.clipboard.writeText(roast);
                }
                if (selection === 'Play Roast Audio') {
                    const audioPath = await textToSpeech(roast, currentApiKey);
                    if (audioPath) {
                        playAudio(audioPath);
                    }
                    else {
                        vscode.window.showErrorMessage('Failed to generate audio for roast.');
                    }
                }
            });
        }
    }
    // Listen for text document changes
    const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(async (event) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || event.document !== editor.document) {
            return;
        }
        // Only trigger on meaningful changes (not just cursor movement)
        if (event.contentChanges.length > 0) {
            // Add a small delay to avoid triggering on every keystroke
            setTimeout(() => attemptRoast(editor), 2000);
        }
    });
    // Listen for active editor changes
    const onDidChangeActiveTextEditor = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (editor) {
            // When switching to a new file, maybe roast it after a delay
            setTimeout(() => attemptRoast(editor), 5000);
        }
    });
    // Manual roast command (keep the original functionality)
    const manualRoastCommand = vscode.commands.registerCommand('code-roaster.roastMe', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Open a file to roast!');
            return;
        }
        const currentApiKey = await getApiKey();
        if (!currentApiKey) {
            vscode.window.showWarningMessage('OpenAI API key is required to roast your code');
            return;
        }
        let codeToRoast = '';
        if (!editor.selection.isEmpty) {
            codeToRoast = editor.document.getText(editor.selection);
        }
        else {
            codeToRoast = editor.document.getText();
        }
        if (!codeToRoast.trim()) {
            vscode.window.showWarningMessage('No code found to roast!');
            return;
        }
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Roasting your code... 🔥',
            cancellable: false
        }, async () => {
            const roast = await roastCode(codeToRoast, currentApiKey);
            if (roast) {
                vscode.window.showInformationMessage(`🔥 ${roast}`, 'Copy to Clipboard').then(selection => {
                    if (selection === 'Copy to Clipboard') {
                        vscode.env.clipboard.writeText(roast);
                    }
                });
            }
            else {
                vscode.window.showErrorMessage('Failed to roast your code. Check your API key and try again.');
            }
        });
    });
    // Register all disposables
    context.subscriptions.push(onDidChangeTextDocument, onDidChangeActiveTextEditor, manualRoastCommand);
}
// This method is called when your extension is deactivated
function deactivate() { }
//# sourceMappingURL=extension.js.map