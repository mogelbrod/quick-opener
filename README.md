# Quick Opener for [Visual Studio Code](https://code.visualstudio.com/)

<!--<img width="40" src="https://raw.githubusercontent.com/mogelbrod/quick-opener/main/icon.png" alt="" align="left">-->

An extension that makes it easy to open files anywhere:

- …outside the VS Code workspace
- …relative to the currently open file
- …from a given git branch/tag/commit
- …from the list of modified files in the git working tree

<img width="600" src="https://user-images.githubusercontent.com/150084/196005417-91f2bc86-2b7c-48fb-99ae-fef88514fd29.gif" alt="Animated example"><br>

## Installation

1. Navigate to the Quick Opener extension page within VS Code by either:
   - Visiting [visualstudio marketplace](https://marketplace.visualstudio.com/items?itemName=mogelbrod.quickopener)
   - Searching for `mogelbrod.quickopener` from the VS Code _Extensions_ sidebar
2. Press the corresponding _Install_ button
3. (optional) [Add keybindings for additional functionality](#custom-key-bindings)

## Features

_Note: Key bindings on Mac use <kbd>⌘</kbd> in place of <kbd>Ctrl</kbd>._

### Open/create any local file

- Show the Quick Opener picker by pressing <kbd>Ctrl</kbd>-<kbd>O</kbd>
- Open any path across the file system using only the keyboard - avoid the native file system popups
- Fuzzy path matching using the built-in VS Code fuzzy matcher
- Starts in directory of current file (if open) to make relative navigation quick and easy
- Begin entering any absolute path (or a pre-configured prefix) to quickly locate files outside the current workspace
- Navigate to parent directory by entering `..` or pressing <kbd>Ctrl</kbd>-<kbd>U</kbd>
- Additional functionality available via window and item buttons, as well as keybindings:
  - <kbd>Enter</kbd>
    - **File:** Open file
    - **Directory:** Change relative root directory
  - <kbd>Ctrl</kbd>-<kbd>O</kbd>
    - **File:** Open in split editor
    - **Directory:** Add/remove directory to/from workspace
  - <kbd>Ctrl</kbd>-<kbd>Shift</kbd>-<kbd>O</kbd>
    - **Directory:** Open directory in new window
  - <kbd>Ctrl</kbd>-<kbd>U</kbd> - Cut off last part of the input path / navigate to parent directory
  - <kbd>Ctrl</kbd>-<kbd>N</kbd> - Create new file (or directory if input ends with a slash) at the given path,
    with ancestor directories created in the process
  - <kbd>Tab</kbd> - Replace input value with selected item

### Open by git ref/revision

Browse and open files as they existed from any git branch, tag, or commit SHA via the
`quickOpener.showRevisionPicker` command (_Quick Opener: Open by Revision_). The
command will by default first prompt for a ref, and upon selection trigger the
[_Open File at Revision_ command](#open-file-at-revision--in-working-tree).

This command is not bound to a keyboard shortcut by default; see [Custom key bindings](#custom-key-bindings).

- Lists all local/remote branches and tags, grouped by type
- Type any commit SHA to use it directly without selecting from the list
- Selecting a ref opens a file revision picker, enabling opening of any file that existed in that ref
- Additional functionality is available via item buttons and keybinds:
  - <kbd>Ctrl</kbd>-<kbd>O</kbd> - Open a diff view of changes in the given ref
  - <kbd>Ctrl</kbd>-<kbd>D</kbd> - Diff the current working tree against this ref
- Toggle visibility of additional metadata via the title bar buttons
  - <kbd>Ctrl</kbd>-<kbd>E</kbd> - Toggle description format between short SHA or custom metadata
  - <kbd>Ctrl</kbd>-<kbd>M</kbd> - Toggle commit message visibility
- Customize metadata format via `quickOpener.refDescriptionFormat` setting

**Example keybindings:**

See [Commands](#commands) for list of available arguments.

```jsonc
  { // Pick git revision, then file from revision to open
    "key": "ctrl+g /",
    "command": "quickOpener.showRevisionPicker",
  },
  { // Pick git revision to open current file from
    "key": "ctrl+g o",
    "command": "quickOpener.showRevisionPicker",
    "args": { "skipFileSelection": true },
  },
```

### Open file at revision / in working tree

The `quickOpener.showRevisionFilePicker` command (_Quick Opener: Open File at Revision_)
can be used standalone, without first selecting a ref via the revision picker.

This command is not bound to a keyboard shortcut by default; see [Custom key bindings](#custom-key-bindings).

- By default (no `ref` argument) shows all files **changed in the working tree** (staged & unstaged changes vs `HEAD`)
- Provide a `ref` argument to list files at any branch, tag, or commit SHA instead
- <kbd>Ctrl</kbd>-<kbd>M</kbd> - Toggle between _all files at the ref_ and _only changed files_ via the title bar button
- Additional functionality is available via item buttons and keybinds:
  - <kbd>Ctrl</kbd>-<kbd>O</kbd> - Open in split editor
  - <kbd>Ctrl</kbd>-<kbd>Shift</kbd>-<kbd>O</kbd> - Diff the file against its parent commit
  - <kbd>Ctrl</kbd>-<kbd>D</kbd> - Diff the current working tree against the file at this ref

## Extension contributions

### Commands

- `quickOpener.show`: Show the Quick Opener picker.
- `quickOpener.showRevisionPicker`: Show the _Open by Revision_ picker, listing all git branches and tags.
  Selecting a ref opens the _Open File at Revision_ picker for that ref.<br>
  <small>
  Accepts an optional object argument:
  - `branches = true` - include branches in the list
  - `tags = true` - include tags in the list
  - `file = '${relativeFile}'` - pre-fill the file input
  - `skipFileSelection = false` - Open `file` immediately (if it exists) after selecting revision - this will also change the diff item actions to only include the `file`
  - `initialValue = ''` - pre-fill the revision input
  - `filterByStatus?: string` - forwarded to the file picker; filter files by git status letter(s) (e.g. `'AM'`)
    </small>
- `quickOpener.showRevisionFilePicker`: Show a picker listing files at a given git ref.<br>
  <small>
  Accepts an optional object argument:
  - `ref` - branch name, tag, or commit SHA to list files from.
    Omit (or leave unset) to show files changed in the **working tree** (staged + unstaged vs `HEAD`).
  - `initialValue?: string` - pre-fill the search input
  - `filterByStatus?: string | true` - only show files whose git diff status letter appears in this
    string. Supported letters: `A` (added), `C` (copied), `D` (deleted), `M` (modified),
    `R` (renamed), `T` (type change). Pass `true` to filter by any change.
    Example: `'AM'` shows only added and modified files.
    </small>

**Available while any picker is visible:**

- `quickOpener.triggerAction`: Trigger a window (title bar) button action.<br>
  <small>
  Expects a single argument:
  - `number` - 1-based index of the button to trigger (default: `1`)
  - `string` - ID of the button action to trigger. Available action IDs depend on the active picker:<br>
    **quick**: `createFile`, `createDirectory`, `workspaceAdd`, `workspaceRemove`, `openWindow`<br>
    **revision**: `toggleDescription`, `toggleMessage`<br>
    **revision-file**: `toggleChanged`, `openChanges`, `openDiff`
    </small>
- `quickOpener.triggerItemAction`: Trigger a button action on the currently selected item.<br>
  <small>
  Expects a single argument:
  - `number` - 1-based index of the button to trigger (default: `1`)
  - `string` - ID of the button action to trigger. Available action IDs depend on the active picker:<br>
    **quick**: `openSplit`, `workspaceOpen`, `workspaceAdd`, `workspaceRemove`, `openWindow`<br>
    **revision**: `openChanges`, `openDiff`<br>
    **revision-file**: `openSplit`, `openChanges`, `openDiff`
    </small>

**Available while the `quickOpener.show` picker is visible:**

- `quickOpener.triggerTabCompletion`: Replace the input value with the selected item path.
- `quickOpener.popPath`: Go upwards in the path by chopping off the last part of the input (if present), or by navigating to parent directory.

### Key bindings

The default behaviour of the extension is to take over the standard key binding to open a file/folder:
<kbd>Ctrl</kbd>-<kbd>O</kbd> (Mac: <kbd>⌘</kbd>-<kbd>O</kbd>).

You can configure key bindings from within vscode via _Open Keyboard Shortcuts_, or by editing
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

Examples of key bindings for features not bound by default:

```jsonc
  { // Pick git revision, then file from revision to open
    "key": "ctrl+g /",
    "command": "quickOpener.showRevisionPicker",
  },
  { // Pick git revision to open current file from
    "key": "ctrl+g o",
    "command": "quickOpener.showRevisionPicker",
    "args": { "skipFileSelection": true },
  },
  { // Pick changed file from git working tree
    "key": "ctrl+g m",
    "command": "quickOpener.showRevisionFilePicker",
  },
```

A `when` condition can be specified to limit a key bind to when a picker is visible, with the following options:

- `inQuickOpener` - when any picker is visible
- `inQuickOpener == 'quick'` - file picker visible
- `inQuickOpener == 'revision'` - revision picker visible
- `inQuickOpener == 'revision-file'` - revision file picker visible

```jsonc
  { // In quick picker: Open selected directory in new window
    "when": "inQuickOpener == 'quick'",
    "command": "quickOpener.triggerAction",
    "args": "openWindow",
    "key": "ctrl+shift+n",
  },
  { // In any picker: Trigger first visible action for item (action depends on item type)
    "when": "inQuickOpener", // when any quick picker is visible
    "command": "quickOpener.triggerItemAction",
    "args": 1,
    "key": "ctrl+t",
  },
```

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

## Credits

- [Icon](https://github.com/mogelbrod/quick-opener/blob/main/icon.png): Created with the assistance of DALL·E 2
