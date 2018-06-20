'use babel';

import { CompositeDisposable } from 'atom';
import path from 'path';
import execa from 'execa';
import os from 'os';

const d = { dismissable: true };

function format(str, n = 1) {
  const arr = str.split('\n').slice(0, n);
  return arr.length === 1 ? arr[0] : arr.join('\n');
}

function formatFailure(err) {
  return format(err.stderr);
}

export default {
  subscriptions: null,
  name: '',
  mainClass: '',
  currentEditor: null,
  currentListener: null,
  running: false,
  proc: null,
  path: '',
  config: {
    greenfootInstall: {
      type: 'string',
      default: path.join(os.homedir(), '.bin', 'greenfoot-lib')
    }
  },

  activate() {
    this.subscriptions = new CompositeDisposable();
    [this.path] = atom.project.getPaths();
    this.name = path.basename(this.path);
    const activeEditor = atom.workspace.getActiveTextEditor();
    this.mainClass = path.basename(activeEditor.getPath()).replace('.java', '');
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'atom-greenfoot:toggle': () => this.toggle(),
      'atom-greenfoot:run': () => this.run()
    }));
    this.greenfootInstall = atom.config.get('atom-greenfoot.greenfootInstall');
    const bluejcore = path.join(this.greenfootInstall, 'lib/bluejcore.jar');
    const greenfoot = path.join(this.greenfootInstall, 'lib/extensions/greenfoot.jar');
    this.classpath = [bluejcore, greenfoot, '.'].join(':');
    this.subscriptions.add(atom.workspace.onDidChangeActiveTextEditor(editor => {
      this.currentEditor = editor;
      if (this.currentListener) {
        this.currentListener.dispose();
      }
      if (this.currentEditor) {
        this.currentListener = this.currentEditor.onDidSave(() => this.compile(editor.getPath()));
      }
    }));

    execa.shell(`javac -cp ${this.classpath} *.java`, { cwd: this.path })
      .then(() => atom.notifications.addSuccess('Built all', d))
      .catch(() => atom.notifications.addError('Failed to build all', d));
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  toggle() {
    this.running = !this.running;
  },

  run() {
    if (!this.running) return;
    if (this.proc) {
      this.proc.kill('SIGTERM');
    }
    atom.notifications.addInfo('Running project', {
      buttons: [
        {
          text: 'kill',
          onDidClick: () => this.proc.kill('SIGTERM')
        }
      ]
    });
    const labels = path.join(this.greenfootInstall, 'lib/english/greenfoot/greenfoot-labels');
    this.proc = execa.shell([
      'java -cp',
      this.classpath,
      'greenfoot.export.GreenfootScenarioMain',
      this.name,
      this.mainClass,
      labels
    ].join(' '), { cwd: this.path });
    this.proc.stderr.on(
      'data',
      buffer => atom.notifications.addInfo('Project gave output', { detail: buffer.toString() })
    );
    this.proc.stdout.on(
      'data',
      buffer => atom.notifications.addInfo('Project gave output', { detail: buffer.toString() })
    );
    this.proc.then(() => {
      atom.notifications.addSuccess('Ran project', d);
    }).catch(err => {
      atom.notifications.addError('Error running project', {
        dismissable: true,
        detail: `${err.stdout}\n${err.stderr}`
      });
    });
  },

  compile(file) {
    if (!this.running) return;
    const noti = atom.notifications.addInfo(`Compiling ${file}`);
    execa.shell(`javac -cp ${this.classpath} ${file}`, { cwd: this.path })
      .then(() => {
        noti.dismiss();
        atom.notifications.addSuccess(`Compiled ${file}`, d);
      })
      .catch(err => {
        noti.dismiss();
        atom.notifications.addError(`Error encountered building ${file}, ${formatFailure(err)}`, d);
      });
  }

};
