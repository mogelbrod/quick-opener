# Quick Opener for [Visual Studio Code](https://code.visualstudio.com/)

<!--<img width="40" src="https://raw.githubusercontent.com/mogelbrod/quick-opener/main/icon.png" alt="" align="left">-->

A plugin that makes it easy to open files outside the VS Code workspace
(or relative to the current file) using a
[quick pick window](https://code.visualstudio.com/api/ux-guidelines/quick-picks).

<img width="600" src="https://user-images.githubusercontent.com/150084/196005417-91f2bc86-2b7c-48fb-99ae-fef88514fd29.gif" alt="Animated example"><br>

## Features

- Show the Quick Opener picker by pressing <kbd>Ctrl</kbd>-<kbd>O</kbd> (Mac: <kbd>⌘</kbd>-<kbd>O</kbd>)
- Open any path across the file system using only the keyboard (no more native file system popups)
- Fuzzy path matching using the built-in VS Code fuzzy matcher
- Starts in directory of current file (if open) to make relative navigation quick and easy
- Begin entering any absolute path (or `~/`) to quickly locate files outside the current workspace
- Supports ancestor paths such as `..` for parent directory
- Press <kbd>Enter</kbd> while a directory is highlighted to temporarily change the relative root
- Additional functionality available as window and item buttons (hover over each button icon to see they do):
  - Create new files and directories at the given path (ancestor directories created in the process)
  - Open file in a vertical split
  - Open directory in new VS Code window
  - Add/remove directories to/from the current workspace

## Extension contributions

### Commands

- `quickOpener.show`: Show the Quick Opener picker.

### Settings

- `quickOpener.exclude`: List of directory/file names to exclude from the results.
  Compared against the name of each path component.<br>
  _Default value:_ `["node_modules", ".git", ".DS_Store"]`
- `quickOpener.timeout`: Maximum time (in ms) for scanner to run between input and showing results.<br>
  _Default value:_ `200`

## Customize key binding

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

## Known Issues

- The contents of nested subdirectories are sometimes not included in the
  suggestions. This is due to a limitation of the current scanner, and will be
  addressed in a future release.

## Disclaimer

The _Create directory/file_ functionality will attempt to create directories when necessary. This should not cause any data to be lost or overwritten, but I can unfortunately not guarantee that it will never happen in every possible situation.

## Credits

- [Icon](https://github.com/mogelbrod/quick-opener/blob/main/icon.png): Created with the assistance of DALL·E 2
