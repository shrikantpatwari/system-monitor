import * as vscode from 'vscode';
import { MonitorTreeDataProvider } from './system-monitor/monitor-tree-data-provider';
import { SystemMonitorPanel, getWebviewOptions } from './system-monitor/system-monitor-panel';

export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "system-monitor" is now active!');
	vscode.window.registerTreeDataProvider('systemMonitor', new MonitorTreeDataProvider());
	let disposable = vscode.commands.registerCommand('systemMonitor.start', () => {
		SystemMonitorPanel.createOrShow(context.extensionUri);
	});

	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(SystemMonitorPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);
				// Reset the webview options so we use latest uri for `localResourceRoots`.
				webviewPanel.webview.options = getWebviewOptions(context.extensionUri);
				SystemMonitorPanel.revive(webviewPanel, context.extensionUri);
			}
		});
	}

	context.subscriptions.push(disposable);
}

export function deactivate() { }
