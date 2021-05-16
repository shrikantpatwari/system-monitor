import * as vscode from 'vscode';
import * as si from 'systeminformation';
import * as osLocale from 'os-locale';
import * as publicIp from 'public-ip';
import * as os from 'os';
import * as prettyMs from 'pretty-ms';
import * as prettyBytes from 'pretty-bytes';

export class SystemMonitorPanel {
    public static currentPanel: SystemMonitorPanel | undefined;

    public static readonly viewType = 'systemMonitor';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (SystemMonitorPanel.currentPanel) {
            SystemMonitorPanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            SystemMonitorPanel.viewType,
            'System Monitor',
            column || vscode.ViewColumn.One,
            getWebviewOptions(extensionUri),
        );

        SystemMonitorPanel.currentPanel = new SystemMonitorPanel(panel, extensionUri);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        SystemMonitorPanel.currentPanel = new SystemMonitorPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showErrorMessage(message.text);
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public doRefactor() {
        // Send a message to the webview webview.
        // You can send any JSON serializable data.
        this._panel.webview.postMessage({ command: 'refactor' });
    }

    public dispose() {
        SystemMonitorPanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.title = 'System Information';
        this._getHtmlForWebview(webview).then((html) => {
            this._panel.webview.html = html;
        });
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        // Local path to main script run in the webview
        let bootstapCSSFileName = 'bootstrap.min.css';
        switch (vscode.window.activeColorTheme.kind) {
            case vscode.ColorThemeKind.Light:
                bootstapCSSFileName = 'bootstrap.min.css'; 
                break;
            case vscode.ColorThemeKind.Dark:
                bootstapCSSFileName = 'bootstrap_dark.min.css';
                break;
            case vscode.ColorThemeKind.HighContrast:
                bootstapCSSFileName = 'bootstrap_dark.min.css';
                break;
        }

        // Local path to css styles
        const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css');
        const stylesBootStrapPath = vscode.Uri.joinPath(this._extensionUri, 'media', bootstapCSSFileName);
        const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css');

        // Uri to load styles into webview
        const stylesResetUri = webview.asWebviewUri(styleResetPath);
        const styleBootStrapPath = webview.asWebviewUri(stylesBootStrapPath);
        const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
        const staticData = await si.getStaticData()
        const locale = await osLocale()
        const listeningIp = await publicIp.v4({ onlyHttps: true })
        let lastUpdate = 0
        let input: { 
            staticData: any; 
            listeningIp: any;  
            locale: any;
            prettyUptime: any; 
            avgload: any; 
            currentLoad: any;
            prettyCurrent: any; 
            time: any; 
            processes: any; 
            cpuCurrentspeed: any; 
            cpuTemp: any; 
            memoryUsage: any; 
            fsSize?: any[]; 
        };
        const time = await si.time()
        const prettyUptime = prettyMs(Math.floor(parseFloat(time.uptime)) * 1000, { verbose: true })
        const prettyCurrent = new Date(Date.now()).toLocaleString()
        const avgload = os.loadavg()
        const currentLoad = await si.currentLoad()
        const cpuCurrentspeed = await si.cpuCurrentSpeed()
        const cpuTemp = await si.cpuTemperature()
        const processes = await si.processes()
        const memoryUsage = await si.mem()
        let fsSizes = await si.fsSize()
        const fsSize = fsSizes.map(x => {
            const sizeInt = x.size;
            return {
                prettySize: prettyBytes(sizeInt),
                prettyUsed: prettyBytes(x.used),
                prettyFree: prettyBytes(sizeInt - x.used),
                fs: x.fs,
                type: x.type,
                size: x.size,
                used: x.used,
                available: x.available,
                use: x.use,
                mount: x.mount,
            }
        })
        input = { 
            staticData, 
            locale, 
            listeningIp, 
            time, 
            prettyUptime, 
            prettyCurrent, 
            avgload, 
            currentLoad, 
            processes, 
            memoryUsage, 
            fsSize, 
            cpuCurrentspeed, 
            cpuTemp
        };
        lastUpdate = Date.now()

        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link nonce="${nonce}" href="${stylesResetUri}" rel="stylesheet">
                <link nonce="${nonce}" href="${styleBootStrapPath}" rel="stylesheet">
                <link nonce="${nonce}" href="${stylesMainUri}" rel="stylesheet">

				<title>System Information</title>
			</head>
			<body>
            <div class="container" id="app">
            <nav class="navbar navbar-dark bg-dark rounded shadow-sm mb-3">
              <a class="navbar-brand" href="/">
                System Information
              </a>
            </nav>
        
            <div class="row justify-content-center mb-3">
        
              <div class="col-12 col-lg-6 mb-3">
                <div class="card text-white shadow-sm">
                  <h6 class="card-header">System Vital</h6>
                  <div class="card-body">
                    <div class="table-responsive">
                      <table class="table table-hover table-sm">
                        <tbody>
                          <tr>
                            <td>Canonical Hostname</td>
                            <td>${input.staticData.os.hostname}</td>
                          </tr>
                          <tr>
                            <td>Listening IP</td>
                            <td>${input.listeningIp}</td>
                          </tr>
                          <tr>
                            <td>Kernel Version</td>
                            <td>${input.staticData.versions.kernel}</td>
                          </tr>
                          <tr>
                            <td>Distro Name</td>
                            <td>${input.staticData.os.distro}</td>
                          </tr>
                          <tr>
                            <td>Uptime</td>
                            <td>${input.prettyUptime}</td>
                          </tr>
                          <tr>
                            <td>Average load</td>
                            <td>
                              <div class="float-left">
                                ${input.avgload[0].toFixed(2)} ${input.avgload[1].toFixed(2)} ${input.avgload[2].toFixed(2)}
                              </div>
                              <div class="float-right" style="width:50%;">
                                <div class="progress">
                                  <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${input.currentLoad.avgLoad}%;"
                                    aria-valuenow="${input.currentLoad.avgLoad}" aria-valuemin="0" aria-valuemax="100"></div>
                                </div>
                                <div class="text-center">${input.currentLoad.avgLoad}%</div>
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td>System Language</td>
                            <td>${input.locale}</td>
                          </tr>
                          <tr>
                            <td>Local time</td>
                            <td>${input.prettyCurrent}</td>
                          </tr>
                          <tr>
                            <td>Time zone</td>
                            <td>${input.time.timezone}</td>
                          </tr>
                          <tr>
                            <td>Time zone name</td>
                            <td>${input.time.timezoneName}</td>
                          </tr>
                          <tr>
                            <td>Processes</td>
                            <td>${input.processes.all} (${input.processes.running} running, ${input.processes.sleeping}
                              sleeping, ${input.processes.blocked} blocked, ${input.processes.unknown} unknown)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
        
              <div class="col-12 col-lg-6 mb-3">
                <div class="card text-white shadow-sm">
                  <h6 class="card-header">CPU Usage</h6>
                  <div class="card-body">
                    <div class="table-responsive">
                      <table class="table table-hover table-sm">
                        <thead>
                          <th scope="col">Core</th>
                          <th scope="col" style="width:60%;">Load</th>
                          <th scope="col">Speed</th>
                          <th scope="col">Temp</th>
                        </thead>
                        <tbody>
                          ${input.currentLoad.cpus.map((cpu: { load: number; }, index: number) => {
                                return `<tr>
                                        <td>Core ${index + 1}</td>
                                        <td>
                                            <div class="progress">
                                                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${cpu.load}%;"></div>
                                            </div>
                                            <div class="text-center">${cpu.load.toFixed(2)}%</div>
                                        </td>
                                        <td>${input.cpuCurrentspeed.cores[index]} Ghz</td>
                                        <td>${input.cpuTemp.cores[index]}</td>
                                    </tr>
                                `})
                            }
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
        
              <div class="col-12 mb-3">
                <div class="card text-white shadow-sm">
                  <h6 class="card-header">Memory Usage</h6>
                  <div class="card-body">
                    <div class="table-responsive">
                      <table class="table table-hover table-sm">
                        <thead>
                          <tr>
                            <th scope="col">Type</th>
                            <th scope="col" style="width:50%;">Usage</th>
                            <th scope="col">Free</th>
                            <th scope="col">Used</th>
                            <th scope="col">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Physical</td>
                            <td>
                              <div class="progress">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${input.memoryUsage.active / input.memoryUsage.total * 100}%;"></div>
                                <div class="progress-bar bg-warning progress-bar-striped progress-bar-animated" role="progressbar"
                                  style="width: ${input.memoryUsage.buffcache / input.memoryUsage.total * 100}%;"></div>
                              </div>
                              <div class="text-center">${(input.memoryUsage.used / input.memoryUsage.total * 100).toFixed(2)}%
                                (active: ${(input.memoryUsage.active / input.memoryUsage.total * 100).toFixed(2)}%, buffcache:
                                ${(input.memoryUsage.buffcache / input.memoryUsage.total * 100).toFixed(2)}%)</div>
                            </td>
                            <td>${(input.memoryUsage.free / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                            <td>${(input.memoryUsage.used / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                            <td>${(input.memoryUsage.total / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                          </tr>
                          <tr>
                            <td>SWAP</td>
                            <td>
                              <div class="progress">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${input.memoryUsage.swapused / input.memoryUsage.swaptotal * 100}%;"></div>
                              </div>
                              <div class="text-center">${(input.memoryUsage.swapused / input.memoryUsage.swaptotal * 100).toFixed(2)}%</div>
                            </td>
                            <td>${(input.memoryUsage.swapfree / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                            <td>${(input.memoryUsage.swapused / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                            <td>${(input.memoryUsage.swaptotal / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
        
              <div class="col-12 mb-3">
                <div class="card text-white shadow-sm">
                  <h6 class="card-header">Storage Usage</h6>
                  <div class="card-body">
                    <div class="table-responsive">
                      <table class="table table-hover table-sm">
                        <thead>
                          <tr>
                            <th scope="col">Mount</th>
                            <th scope="col">Type</th>
                            <th scope="col">Fs</th>
                            <th scope="col" style="width:50%">Usage</th>
                            <th scope="col">Free</th>
                            <th scope="col">Used</th>
                            <th scope="col">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                            ${input.fsSize?.map((storage) => {
                                return `
                                    <tr>
                                        <td>${storage.mount}</td>
                                        <td>${storage.type}</td>
                                        <td>${storage.fs}</td>
                                        <td>
                                        <div class="progress">
                                            <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: ${storage.used / storage.size * 100}%;"></div>
                                        </div>
                                        <div class="text-center">${(storage.used / storage.size * 100).toFixed(2)}%</div>
                                        </td>
                                        <td>${storage.prettyFree}</td>
                                        <td>${storage.prettyUsed}</td>
                                        <td>${storage.prettySize}</td>
                                    </tr>
                                `})
                            }
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
        
            <hr>
        
            <div class="row justify-content-center">
              <div class="col-12">
                <div class="card-columns">
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">Operating system</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            <tr>
                              <td>Platform</td>
                              <td>${input.staticData.os.platform}</td>
                            </tr>
                            <tr>
                              <td>Distro</td>
                              <td>${input.staticData.os.distro}</td>
                            </tr>
                            <tr>
                              <td>Release</td>
                              <td>${input.staticData.os.release}</td>
                            </tr>
                            <tr>
                              <td>Codename</td>
                              <td>${input.staticData.os.codename}</td>
                            </tr>
                            <tr>
                              <td>Kernel</td>
                              <td>${input.staticData.os.kernel}</td>
                            </tr>
                            <tr>
                              <td>Arch</td>
                              <td>${input.staticData.os.arch}</td>
                            </tr>
                            <tr>
                              <td>Hostname</td>
                              <td>${input.staticData.os.hostname}</td>
                            </tr>
                            <tr>
                              <td>Logofile</td>
                              <td>${input.staticData.os.logofile}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">System</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            <tr>
                              <td>Manufacturer</td>
                              <td>${input.staticData.system.manufacturer}</td>
                            </tr>
                            <tr>
                              <td>Model</td>
                              <td>${input.staticData.system.model}</td>
                            </tr>
                            <tr>
                              <td>Version</td>
                              <td>${input.staticData.system.version}</td>
                            </tr>
                            <tr>
                              <td>Serial</td>
                              <td>${input.staticData.system.serial}</td>
                            </tr>
                            <tr>
                              <td>UUID</td>
                              <td>${input.staticData.system.uuid}</td>
                            </tr>
                            <tr>
                              <td>SKU</td>
                              <td>${input.staticData.system.sku}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">Baseboard</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            <tr>
                              <td>Manufacturer</td>
                              <td>${input.staticData.baseboard.manufacturer}</td>
                            </tr>
                            <tr>
                              <td>Model</td>
                              <td>${input.staticData.baseboard.model}</td>
                            </tr>
                            <tr>
                              <td>Version</td>
                              <td>${input.staticData.baseboard.version}</td>
                            </tr>
                            <tr>
                              <td>Serial</td>
                              <td>${input.staticData.baseboard.serial}</td>
                            </tr>
                            <tr>
                              <td>AssetTag</td>
                              <td>${input.staticData.baseboard.assetTag}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">Bios</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            <tr>
                              <td>Vendor</td>
                              <td>${input.staticData.bios.vendor}</td>
                            </tr>
                            <tr>
                              <td>Version</td>
                              <td>${input.staticData.bios.version}</td>
                            </tr>
                            <tr>
                              <td>ReleaseDate</td>
                              <td>${input.staticData.bios.releaseDate}</td>
                            </tr>
                            <tr>
                              <td>Revision</td>
                              <td>${input.staticData.bios.revision}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">CPU</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            <tr>
                              <td>Manufacturer</td>
                              <td>${input.staticData.cpu.manufacturer}</td>
                            </tr>
                            <tr>
                              <td>Brand</td>
                              <td>${input.staticData.cpu.brand}</td>
                            </tr>
                            <tr>
                              <td>Vendor</td>
                              <td>${input.staticData.cpu.vendor}</td>
                            </tr>
                            <tr>
                              <td>Family</td>
                              <td>${input.staticData.cpu.family}</td>
                            </tr>
                            <tr>
                              <td>Model</td>
                              <td>${input.staticData.cpu.model}</td>
                            </tr>
                            <tr>
                              <td>Stepping</td>
                              <td>${input.staticData.cpu.stepping}</td>
                            </tr>
                            <tr>
                              <td>Revision</td>
                              <td>${input.staticData.cpu.revision}</td>
                            </tr>
                            <tr>
                              <td>Voltage</td>
                              <td>${input.staticData.cpu.voltage}</td>
                            </tr>
                            <tr>
                              <td>Speed</td>
                              <td>${input.staticData.cpu.speed} Ghz</td>
                            </tr>
                            <tr>
                              <td>Speedmin</td>
                              <td>${input.staticData.cpu.speedmin} Ghz</td>
                            </tr>
                            <tr>
                              <td>Speedmax</td>
                              <td>${input.staticData.cpu.speedmax} Ghz</td>
                            </tr>
                            <tr>
                              <td>Cores</td>
                              <td>${input.staticData.cpu.cores}</td>
                            </tr>
                            <tr>
                              <td>Cache</td>
                              <td>
                                <table class="table table-hover table-sm">
                                  <tbody>
                                    <tr>
                                      <td>L1D</td>
                                      <td>${(input.staticData.cpu.cache.l1d / 1024 / 1024).toFixed(2)} MB</td>
                                    </tr>
                                    <tr>
                                      <td>L1I</td>
                                      <td>${(input.staticData.cpu.cache.l1i / 1024 / 1024).toFixed(2)} MB</td>
                                    </tr>
                                    <tr>
                                      <td>L2</td>
                                      <td>${(input.staticData.cpu.cache.l2 / 1024 / 1024).toFixed(2)} MB</td>
                                    </tr>
                                    <tr>
                                      <td>L3</td>
                                      <td>${(input.staticData.cpu.cache.l3 / 1024 / 1024).toFixed(2)} MB</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                            <tr>
                              <td>flags</td>
                              <td>${input.staticData.cpu.flags}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">GPU</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            ${input.staticData.graphics.controllers.map((gpu: { model: any; vendor: any; bus: any; vram: any; vramDynamic: any; }, index: any) => {
                                return `
                                        <tr>
                                            <td>
                                            ${index}
                                            </td>
                                            <td>
                                            <table class="table table-hover table-sm">
                                                <tbody>
                                                <tr>
                                                    <td>Model</td>
                                                    <td>${gpu.model}</td>
                                                </tr>
                                                <tr>
                                                    <td>Vendor</td>
                                                    <td>${gpu.vendor}</td>
                                                </tr>
                                                <tr>
                                                    <td>Bus</td>
                                                    <td>${gpu.bus}</td>
                                                </tr>
                                                <tr>
                                                    <td>Vram</td>
                                                    <td>${gpu.vram} MB</td>
                                                </tr>
                                                <tr>
                                                    <td>VramDynamic</td>
                                                    <td>${gpu.vramDynamic}</td>
                                                </tr>
                                                </tbody>
                                            </table>
                                            </td>
                                        </tr>
                                    `;
                                }).join("")
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">Display</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            ${input.staticData.graphics.displays.map((display: { model: any; main: any; builtin: any; connection: any; resolutionx: any; resolutiony: any; sizex: any; sizey: any; pixeldepth: any; }, index: number) => {
                                return `
                                        <tr>
                                            <td>
                                            ${index + 1}
                                            </td>
                                            <td>
                                            <table class="table table-hover table-sm">
                                                <tbody>
                                                <tr>
                                                    <td>Model</td>
                                                    <td>${display.model}</td>
                                                </tr>
                                                <tr>
                                                    <td>main</td>
                                                    <td>${display.main}</td>
                                                </tr>
                                                <tr>
                                                    <td>builtin</td>
                                                    <td>${display.builtin}</td>
                                                </tr>
                                                <tr>
                                                    <td>connection</td>
                                                    <td>${display.connection}</td>
                                                </tr>
                                                <tr>
                                                    <td>resolutionx</td>
                                                    <td>${display.resolutionx}</td>
                                                </tr>
                                                <tr>
                                                    <td>resolutiony</td>
                                                    <td>${display.resolutiony}</td>
                                                </tr>
                                                <tr>
                                                    <td>sizex</td>
                                                    <td>${display.sizex}</td>
                                                </tr>
                                                <tr>
                                                    <td>sizey</td>
                                                    <td>${display.sizey}</td>
                                                </tr>
                                                <tr>
                                                    <td>pixeldepth</td>
                                                    <td>${display.pixeldepth}</td>
                                                </tr>
                                                </tbody>
                                            </table>
                                            </td>
                                        </tr>
                                    `;
                                })
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">memLayout</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            ${input.staticData.memLayout.map((mem: { size: number; bank: any; type: any; clockSpeed: any; formFactor: any; manufacturer: any; partNum: any; serialNum: any; voltageConfigured: any; voltageMin: any; voltageMax: any; }, index: number) => {
                                return `
                                        <tr>
                                            <td>
                                            ${index + 1}
                                            </td>
                                            <td>
                                            <table class="table table-hover table-sm">
                                                <tbody>
                                                <tr>
                                                    <td>size</td>
                                                    <td>${(mem.size / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                                                </tr>
                                                <tr>
                                                    <td>bank</td>
                                                    <td>${mem.bank}</td>
                                                </tr>
                                                <tr>
                                                    <td>type</td>
                                                    <td>${mem.type}</td>
                                                </tr>
                                                <tr>
                                                    <td>clockSpeed</td>
                                                    <td>${mem.clockSpeed}</td>
                                                </tr>
                                                <tr>
                                                    <td>formFactor</td>
                                                    <td>${mem.formFactor}</td>
                                                </tr>
                                                <tr>
                                                    <td>manufacturer</td>
                                                    <td>${mem.manufacturer}</td>
                                                </tr>
                                                <tr>
                                                    <td>partNum</td>
                                                    <td>${mem.partNum}</td>
                                                </tr>
                                                <tr>
                                                    <td>serialNum</td>
                                                    <td>${mem.serialNum}</td>
                                                </tr>
                                                <tr>
                                                    <td>voltageConfigured</td>
                                                    <td>${mem.voltageConfigured}</td>
                                                </tr>
                                                <tr>
                                                    <td>voltageMin</td>
                                                    <td>${mem.voltageMin}</td>
                                                </tr>
                                                <tr>
                                                    <td>voltageMax</td>
                                                    <td>${mem.voltageMax}</td>
                                                </tr>
                                                </tbody>
                                            </table>
                                            </td>
                                        </tr>
                                    `;
                                })
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">diskLayout</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            ${input.staticData.diskLayout.map((disk: { type: any; name: any; vendor: any; size: number; bytesPerSector: any; totalCylinders: any; totalHeads: any; totalSectors: any; totalTracks: any; tracksPerCylinder: any; sectorsPerTrack: any; firmwareRevision: any; serialNum: any; interfaceType: any; smartStatus: any; }, index: number) => {
                                return `
                                        <tr>
                                            <td>
                                            ${index + 1}
                                            </td>
                                            <td>
                                            <table class="table table-hover table-sm">
                                                <tbody>
                                                <tr>
                                                    <td>type</td>
                                                    <td>${disk.type}</td>
                                                </tr>
                                                <tr>
                                                    <td>name</td>
                                                    <td>${disk.name}</td>
                                                </tr>
                                                <tr>
                                                    <td>vendor</td>
                                                    <td>${disk.vendor}</td>
                                                </tr>
                                                <tr>
                                                    <td>size</td>
                                                    <td>${(disk.size / 1024 / 1024 / 1024).toFixed(2)} GB</td>
                                                </tr>
                                                <tr>
                                                    <td>bytesPerSector</td>
                                                    <td>${disk.bytesPerSector}</td>
                                                </tr>
                                                <tr>
                                                    <td>totalCylinders</td>
                                                    <td>${disk.totalCylinders}</td>
                                                </tr>
                                                <tr>
                                                    <td>totalHeads</td>
                                                    <td>${disk.totalHeads}</td>
                                                </tr>
                                                <tr>
                                                    <td>totalSectors</td>
                                                    <td>${disk.totalSectors}</td>
                                                </tr>
                                                <tr>
                                                    <td>totalTracks</td>
                                                    <td>${disk.totalTracks}</td>
                                                </tr>
                                                <tr>
                                                    <td>tracksPerCylinder</td>
                                                    <td>${disk.tracksPerCylinder}</td>
                                                </tr>
                                                <tr>
                                                    <td>sectorsPerTrack</td>
                                                    <td>${disk.sectorsPerTrack}</td>
                                                </tr>
                                                <tr>
                                                    <td>firmwareRevision</td>
                                                    <td>${disk.firmwareRevision}</td>
                                                </tr>
                                                <tr>
                                                    <td>serialNum</td>
                                                    <td>${disk.serialNum}</td>
                                                </tr>
                                                <tr>
                                                    <td>interfaceType</td>
                                                    <td>${disk.interfaceType}</td>
                                                </tr>
                                                <tr>
                                                    <td>smartStatus</td>
                                                    <td>${disk.smartStatus}</td>
                                                </tr>
                                                </tbody>
                                            </table>
                                            </td>
                                        </tr>
                                    `;
                                })
                            }
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                  <div class="card text-white shadow-sm">
                    <h6 class="card-header">Versions</h6>
                    <div class="card-body">
                      <div class="table-responsive">
                        <table class="table table-hover table-sm">
                          <tbody>
                            <tr>
                              <td>kernel</td>
                              <td>${input.staticData.versions.kernel}</td>
                            </tr>
                            <tr>
                              <td>openssl</td>
                              <td>${input.staticData.versions.openssl}</td>
                            </tr>
                            <tr>
                              <td>node</td>
                              <td>${input.staticData.versions.node}</td>
                            </tr>
                            <tr>
                              <td>v8</td>
                              <td>${input.staticData.versions.v8}</td>
                            </tr>
                            <tr>
                              <td>npm</td>
                              <td>${input.staticData.versions.npm}</td>
                            </tr>
                            <tr>
                              <td>yarn</td>
                              <td>${input.staticData.versions.yarn}</td>
                            </tr>
                            <tr>
                              <td>pm2</td>
                              <td>${input.staticData.versions.pm2}</td>
                            </tr>
                            <tr>
                              <td>gulp</td>
                              <td>${input.staticData.versions.gulp}</td>
                            </tr>
                            <tr>
                              <td>grunt</td>
                              <td>${input.staticData.versions.grunt}</td>
                            </tr>
                            <tr>
                              <td>git</td>
                              <td>${input.staticData.versions.git}</td>
                            </tr>
                            <tr>
                              <td>tsc</td>
                              <td>${input.staticData.versions.tsc}</td>
                            </tr>
                            <tr>
                              <td>mysql</td>
                              <td>${input.staticData.versions.mysql}</td>
                            </tr>
                            <tr>
                              <td>redis</td>
                              <td>${input.staticData.versions.redis}</td>
                            </tr>
                            <tr>
                              <td>mongodb</td>
                              <td>${input.staticData.versions.mongodb}</td>
                            </tr>
                            <tr>
                              <td>nginx</td>
                              <td>${input.staticData.versions.nginx}</td>
                            </tr>
                            <tr>
                              <td>php</td>
                              <td>${input.staticData.versions.php}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
        
                </div>
              </div>
            </div>
          </div>
        </body>
        </html>`;
    }
}

export function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function getWebviewOptions(extensionUri: vscode.Uri): vscode.WebviewOptions {
    return {
        // Enable javascript in the webview
        enableScripts: true,

        // And restrict the webview to only loading content from our extension's `media` directory.
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
    };
}