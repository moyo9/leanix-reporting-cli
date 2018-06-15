import * as chalk from 'chalk';
import * as opn from 'opn';
import * as jwtDecode from 'jwt-decode';
import * as _ from 'lodash';
import { spawn } from 'cross-spawn';
import { PathHelper } from './path-helper';
import { ApiTokenResolver } from './api-token-resolver';
import { LxrConfig } from './interfaces';

interface DevServerStartResult {
  launchUrl: string;
  localhostUrl: string;
}

export class DevStarter {

  private pathHelper = new PathHelper();
  private lxrConfig: LxrConfig = require(this.pathHelper.getLxrConfigPath());

  public start() {
    return this.getAccessToken(this.lxrConfig)
    .then(accessToken => this.startLocalServer(accessToken))
    .then(result => {
      if (result) {
        this.openUrlInBrowser(result.launchUrl);
        console.log(chalk.green(`Open the following url to test your report:\n${result.launchUrl}`) + '\n');
        console.log(chalk.yellow(`If your report is not being loaded, please check if it opens outside of LeanIX via this url:\n${result.localhostUrl}`));
      }
    });
  }

  private startLocalServer(accessToken?: string): Promise<DevServerStartResult> {
    const port = this.lxrConfig.localPort || 8080;
    const localhostUrl = `https://localhost:${port}`;
    const urlEncoded = encodeURIComponent(localhostUrl);
    const host = 'https://' + this.lxrConfig.host;

    let accessTokenHash = accessToken ? `#access_token=${accessToken}` : '';
    let workspace = accessToken ? this.getWorkspaceFromAccesToken(accessToken) :  this.lxrConfig.workspace;

    if (_.isEmpty(workspace)) {
      console.error(chalk.red('Workspace not specified. The local server can\'t be started.'));
      return new Promise(null);
    }
    console.log(chalk.green(`Your workspace is ${workspace}`));

    const baseLaunchUrl = `${host}/${workspace}/reporting/dev?url=${urlEncoded}`;
    const launchUrl = baseLaunchUrl + accessTokenHash;
    console.log(chalk.green('Starting development server and launching with url: ' + baseLaunchUrl));

    const args = ['--https', '--port', '' + port];
    if (this.lxrConfig.ssl && this.lxrConfig.ssl.cert && this.lxrConfig.ssl.key) {
      args.push('--cert=' + this.lxrConfig.ssl.cert);
      args.push('--key=' + this.lxrConfig.ssl.key);
    }

    console.log('' + args.join(' '));
    const serverProcess = spawn('node_modules/.bin/webpack-dev-server', args);
    serverProcess.stdout.on('data', (data) => {
      console.log(data.toString());
    });

    // output errors from webpack
    serverProcess.stderr.on('data', (data) => {
      console.error(chalk.red(data.toString()));
    });

    return new Promise((resolve) => {
      let projectRunning = false;
      serverProcess.on('error', (err) => {
        console.error(err);
      });

      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.indexOf('Project is running') >= 0) {
          projectRunning = true;
        }
        if (projectRunning && output.indexOf('Compiled successfully') >= 0) {
          resolve({ launchUrl, localhostUrl });
        }
      });
    });
  }

  private getWorkspaceFromAccesToken(accessToken: string) {
    const claims = jwtDecode(accessToken);
    return claims.principal.permission.workspaceName;
  }

  private getAccessToken(config: LxrConfig): Promise<string> {
    if (!_.isEmpty(config.apitoken)) {
      return ApiTokenResolver.getAccessToken('https://' + config.host, config.apitoken, config.proxyURL);
    } else {
      return Promise.resolve(null);
    }
  }

  private openUrlInBrowser(url: string) {
    try {
      opn(url);
    } catch (err) {
      console.error('Unable to open your browser: ' + err);
    }
  }
}
