# Quick Opener for [Visual Studio Code](https://code.visualstudio.com/)

<!--<img width="40" src="https://raw.githubusercontent.com/mogelbrod/quick-opener/main/icon.png" alt="" align="left">-->

A plugin that makes it easy to open files anywhere:

- …outside the VS Code workspace
- …relative to the currently open file
- …in a given git branch/tag/commit

<img width="600" src="https://user-images.githubusercontent.com/150084/196005417-91f2bc86-2b7c-48fb-99ae-fef88514fd29.gif" alt="Animated example"><br>

## Features

_Key bindings on Mac use <kbd>⌘</kbd> in place of <kbd>Ctrl</kbd>._

### Open/create any local file

- Show the Quick Opener picker by pressing <kbd>Ctrl</kbd>-<kbd>O</kbd>
- Open any path across the file system using only the keyboard (no more pesky native file system popups!)
- Fuzzy path matching using the built-in VS Code fuzzy matcher
- Starts in directory of current file (if open) to make relative navigation quick and easy
- Begin entering any absolute path (or a pre-configured prefix) to quickly locate files outside the current workspace
- Navigate to parent directory by entering `..` or pressing <kbd>Ctrl</kbd>-<kbd>U</kbd>
- Additional functionality available via window and item buttons, as well as keybindings:
  - <kbd>Enter</kbd> - **File:** Open file / **Directory:** Change relative root directory
  - <kbd>Ctrl</kbd>-<kbd>O</kbd> - **File:** Open in split / **Directory:** Add/remove directory to/from workspace
  - <kbd>Ctrl</kbd>-<kbd>Shift</kbd>-<kbd>O</kbd> - **Directory:** Open directory in new window
  - <kbd>Ctrl</kbd>-<kbd>U</kbd> - Cut off last part of the input path / navigate to parent directory
  - <kbd>Ctrl</kbd>-<kbd>N</kbd> - Create new file (or directory if input ends with a slash) at the given path,
    with ancestor directories created in the process
  - <kbd>Tab</kbd> - Replace input value with selected item

### Open by git ref/revision

Browse and open files as they existed from any git branch, tag, or commit SHA via the
`quickOpener.showRevisionPicker` command ("Quick Opener: Open by Revision").

This command is not bound to a keyboard shortcut by default, see [Custom key bindings](#custom-key-bindings) to set one up.

- Lists all local/remote branches and tags, grouped by type
- Type any commit SHA to use it directly without selecting from the list
- Selecting a ref opens a file revision picker, enabling opening of any file that existed in that ref
- Additional functionality available via item buttons for each ref:
  - _Open changes_ — open a multi-diff view of all changes in the given ref (<kbd>Ctrl</kbd>-<kbd>O</kbd>)
  - _Diff against HEAD_ — open a multi-diff view comparing that ref to `HEAD` (<kbd>Ctrl</kbd>-<kbd>Shift</kbd>-<kbd>O</kbd>)
- Toggle visibility of additional metadata via the title bar buttons
  - _Toggle description format_ — select between showing short SHA or custom metadata (<kbd>Ctrl</kbd>-<kbd>D</kbd>)
  - _Toggle commit message visibility_ — show/hide most recent commit title (<kbd>Ctrl</kbd>-<kbd>M</kbd>)
- Customize metadata format via `quickOpener.refDescriptionFormat` setting

## Installation

1. Navigate to the Quick Opener extension page within VS Code by either:
   - Visiting [marketplace.visualstudio.com/items?itemName=mogelbrod.quickopener](https://marketplace.visualstudio.com/items?itemName=mogelbrod.quickopener)
     and pressing the _Install_ button (this should open VS Code)
   - Searching for `mogelbrod.quickopener` from the VS Code _Extensions_ sidebar
2. Press the corresponding _Install_ button
3. (optional) Configure keybindings - see below for examples

## Extension contributions

### Key bindings

The default behaviour of the plugin is to take over the standard key binding to open a file/folder:
<kbd>Ctrl</kbd>-<kbd>O</kbd> (Mac: <kbd>⌘</kbd>-<kbd>O</kbd>).

You can configure key bindings from within vscode via "Open Keyboard Shortcuts", or by editing
[keybindings.json](https://code.visualstudio.com/docs/getstarted/keybindings#_advanced-customization)
directly. If you wish to use another key binding you can append the following to it:

```jsonc
  {
    "key": "cmd+o", // Revert the binding back to the editor default
    "command": "-quickOpener.show"
  },
  {
    "key": "cmd+shift+o", // New binding to use
    "command": "quickOpener.show"
  },
```

#### Custom key bindings

Example of how to define custom key bindings:

```jsonc
  { // Pick git revision, then file from revision to open
    "key": "ctrl+g /",
    "command": "quickOpener.showRevisionPicker",
  },
  { // Open current file after selecting a git revision
    "key": "ctrl+g o",
    "command": "quickOpener.showRevisionPicker",
    "args": { "skipFileSelection": true },
  },

  { // Trigger first visible action for quick picker item (action depends on item type)
    "when": "inQuickOpener", // when any quick picker is visible
    "command": "quickOpener.triggerItemAction",
    "args": 1,
    "key": "ctrl+t",
  },

  { // Toggle commit message visibility in revision picker (already configured by default)
    "when": "inQuickOpener == 'revision'",
    "command": "quickOpener.triggerAction",
    "args": "toggleMessage",
    "key": "ctrl+m",
  }
```

### Commands

- `quickOpener.show`: Show the Quick Opener picker.
- `quickOpener.showRevisionPicker`: Show the "Open by Revision" picker, listing all git branches and tags.
  Selecting a ref opens the "Open File at Revision" picker for that ref.<br>
  <small>
  Accepts an optional object argument:
  - `branches = true` — include branches in the list
  - `tags = true` — include tags in the list
  - `file = '${relativeFile}` — pre-fill the file input
  - `skipFileSelection = false` — Open `file` immediately (if it exists) after selecting revision
  - `initialValue = ''` — pre-fill the revision input
    </small>
- `quickOpener.showRevisionFilePicker`: Show a picker listing all files at a given git ref.<br>
  <small>
  Accepts an optional object argument:
  - `ref = 'HEAD'` — branch name, tag, or commit SHA to list files from
  - `initialValue?: string` — pre-fill the search input
    </small>

Commands available while the plugin window is visible:

- `quickOpener.triggerAction`: Trigger a window action.
- `quickOpener.triggerItemAction`: Trigger an action for the currently selected item.
- `quickOpener.triggerTabCompletion`: Replace the input value with the selected item path.
- `quickOpener.popPath`: Go upwards in the path by chopping off the last part of the input (if present), or by navigating to parent directory.

### Settings

- `quickOpener.fallbackDirectory`: Directory to start in when there's no workspace/file open in the editor. Supports [vscode variables](https://code.visualstudio.com/docs/editor/variables-reference).<br>
  <small>
  _Default value:_ `"${userHome}"`
  </small>
- `quickOpener.prefixes`: Mapping of path prefixes to their expanded paths. A path starting with any of these strings followed by a directory separator will be expanded to the corresponding path. Supports [vscode variables](https://code.visualstudio.com/docs/editor/variables-reference).<br>
  <small>
  _Default value:_ `{ "~": "${userHome}", "@": "${workspaceFolder}" }`
  </small>
- `quickOpener.exclude`: List of directory/file names to exclude from the results.
  Compared against the name of each path component.<br>
  <small>
  _Default value:_ `["node_modules", ".git", ".DS_Store"]`
  </small>
- `quickOpener.icons`: Show or hide icons in the quick picker.<br>
  <small>
  _Default value:_ `true`
  </small>
- `quickOpener.timeout`: Maximum time (in ms) for scanner to run between input and showing results.
  Set to 0 to disable recursive search.<br>
  <small>
  _Default value:_ `200`
  </small>
- `quickOpener.maxCandidates`: Maximum number of paths to include in the list VS Code fuzzy matches against.
  Lower values improve UI responsiveness at the risk of fewer nested directories being included in the list.<br>
  <small>
  _Default value:_ `10000`
  </small>
- `quickOpener.refDescriptionFormat`: Format string for revision descriptions in the "Open by Revision" picker
  when the _custom_ description style is active (toggled via the info button in the picker).<br>
  <small>
  _Default value:_ `"{commitDate} - {authorName}"`<br>
  Available placeholders:
  - `{name}`
  - `{commit}`
  - `{message}`
  - `{authorName}`
  - `{authorEmail}`
  - `{authorDate}`
  - `{commitDate}`

  Date keys support optional formatting, e.g. `{commitDate:YYYY-MM-DD}`. Supported date tokens:
  - `YYYY` / `YY`
  - `MMM` / `MM`
  - `DD` / `D`
  - `HH` / `H`
  - `mm`
  - `ss`
    </small>

## Disclaimer

The _Create directory/file_ functionality will attempt to create directories when necessary. This should not cause any data to be lost or overwritten, but I can unfortunately not guarantee that it will never happen in every possible situation.

## Credits

- [Icon](https://github.com/mogelbrod/quick-opener/blob/main/icon.png): Created with the assistance of DALL·E 2
