# Quick Opener for [Visual Studio Code](https://code.visualstudio.com/)

<!--<img width="40" src="https://raw.githubusercontent.com/mogelbrod/quick-opener/main/icon.png" alt="" align="left">-->

A plugin that makes it easy to open files outside the VS Code workspace
(or relative to the current file) using a
[quick pick window](https://code.visualstudio.com/api/ux-guidelines/quick-picks).

<img width="600" src="https://user-images.githubusercontent.com/150084/196005417-91f2bc86-2b7c-48fb-99ae-fef88514fd29.gif" alt="Animated example"><br>

## Features

- Show the Quick Opener picker by pressing <kbd>Ctrl</kbd>-<kbd>O</kbd> (Mac: <kbd>⌘</kbd>-<kbd>O</kbd>)
- Open any path across the file system using only the keyboard (no more pesky native file system popups!)
- Fuzzy path matching using the built-in VS Code fuzzy matcher
- Starts in directory of current file (if open) to make relative navigation quick and easy
- Begin entering any absolute path (or `~/`) to quickly locate files outside the current workspace
- Navigate to parent directory by entering `..` or pressing <kbd>Ctrl</kbd>-<kbd>U</kbd> (Mac: <kbd>⌘</kbd>-<kbd>U</kbd>)
- Press <kbd>Enter</kbd> while a directory is highlighted to temporarily change the relative root
- Additional functionality available as window, item buttons, and customizable keybindings:
  - Create new files and directories at the given path, with ancestor directories created in the process
  - Open file in a vertical split
  - Open directory in new VS Code window
  - Add/remove directories to/from the current workspace

## Installation

1. Navigate to the Quick Opener extension page within VS Code by either:
   * Visiting [marketplace.visualstudio.com/items?itemName=mogelbrod.quickopener](https://marketplace.visualstudio.com/items?itemName=mogelbrod.quickopener)
     and pressing the _Install_ button (this should open VS Code)
   * Searching for `mogelbrod.quickopener` from the VS Code _Extensions_ sidebar
2. Press the corresponding _Install_ button

## Extension contributions

### Key bindings

The default behaviour of the plugin is to take over the standard key binding to open a file/folder:
<kbd>Ctrl</kbd>-<kbd>O</kbd> (Mac: <kbd>⌘</kbd>-<kbd>O</kbd>).

If you wish to use another key binding you can append the following to
[keybindings.json](https://code.visualstudio.com/docs/getstarted/keybindings#_advanced-customization):

```json
  {
    "key": "cmd+o", // Revert the binding back to the editor default
    "command": "-quickOpener.show"
  },
  {
    "key": "cmd+shift+o", // New binding to use
    "command": "quickOpener.show"
  },
```

#### While the plugin window is visible

The following bindings are enabled by default when the Quick Opener window is visible.

On Mac <kbd>⌘</kbd> is used in place of <kbd>Ctrl</kbd>.

- <kbd>Enter</kbd> - File: Accept selection / Directory: Change relative root directory
- <kbd>Ctrl</kbd>-<kbd>U</kbd> - Go upwards in the path
- <kbd>Ctrl</kbd>-<kbd>O</kbd> - Trigger first action for selected item
- <kbd>Ctrl</kbd>-<kbd>Shift</kbd>-<kbd>O</kbd> - Trigger second action for selected item
- <kbd>Ctrl</kbd>-<kbd>N</kbd> - Create new file (directory if input ends with a slash)

#### Custom key bindings

Example of how to define custom key bindings:

```json
  {
    "when": "inQuickOpener", // limit binding to when plugin is visible
    "command": "quickOpener.triggerItemAction",
    "args": 1, // trigger first visible action for item (depends on item type)
    "args": 2, // OR trigger second visible action for item (depends on item type)
    "key": "ctrl+shift+o", // windows/linux binding
    "mac": "cmd+shift+o" // mac binding (optional)
  },
  {
    "when": "inQuickOpener",
    "command": "quickOpener.triggerAction",
    "args": ["create"], // create file/directory
    "key": "ctrl+n",
    "mac": "cmd+n"
  }
```

### Settings

- `quickOpener.fallbackDirectory`: Directory to start in when there's no directory/file open in the editor.<br>
  _Default value:_ `"~"`
- `quickOpener.exclude`: List of directory/file names to exclude from the results.
  Compared against the name of each path component.<br>
  _Default value:_ `["node_modules", ".git", ".DS_Store"]`
- `quickOpener.timeout`: Maximum time (in ms) for scanner to run between input and showing results.
  Set to 0 to disable recursive search.<br>
  _Default value:_ `200`
- `quickOpener.maxCandidates`: Maximum number of paths to include in the list VS Code fuzzy matches against.
  Lower values improve UI responsiveness at the risk of fewer nested directories being included in the list.<br>
  _Default value:_ `10000`

### Commands

- `quickOpener.show`: Show the Quick Opener picker.

Commands available when the Quick Opener window is visible:

- `quickOpener.popPath`: Go upwards in the path by chopping off the last part of the input (if present), or by navigating to parent directory.
- `quickOpener.triggerAction`: Trigger an action using the current input as path.
- `quickOpener.triggerItemAction`: Trigger an action using the currently selected item as path.

## Known Issues

- The contents of nested subdirectories are sometimes not included in the
  suggestions. This is due to a limitation of the current scanner, and will be
  addressed in a future release.

## Disclaimer

The _Create directory/file_ functionality will attempt to create directories when necessary. This should not cause any data to be lost or overwritten, but I can unfortunately not guarantee that it will never happen in every possible situation.

## Credits

- [Icon](https://github.com/mogelbrod/quick-opener/blob/main/icon.png): Created with the assistance of DALL·E 2
