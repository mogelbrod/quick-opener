import * as os from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

/**
 * Mock VS Code API
 */
vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    executeCommand: vi.fn(),
  },
  window: {
    createQuickPick: vi.fn(() => ({
      items: [],
      activeItems: [],
      selectedItems: [],
      buttons: [],
      placeholder: '',
      value: '',
      title: '',
      onDidChangeSelection: vi.fn(() => ({ dispose: vi.fn() })),
      onDidChangeValue: vi.fn(() => ({ dispose: vi.fn() })),
      onDidAccept: vi.fn(() => ({ dispose: vi.fn() })),
      onDidHide: vi.fn(() => ({ dispose: vi.fn() })),
      onDidTriggerButton: vi.fn(() => ({ dispose: vi.fn() })),
      onDidTriggerItemButton: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
    })),
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    activeTextEditor: undefined,
  },
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: vi.fn(),
    getConfiguration: vi.fn(() => ({
      get: vi.fn(),
    })),
    openTextDocument: vi.fn(),
  },
  Uri: {
    file: vi.fn((filePath: string) => ({ fsPath: filePath })),
  },
  ThemeIcon: class ThemeIcon {
    static File = new ThemeIcon('file')
    static Folder = new ThemeIcon('folder')

    constructor(public id: string) {}
  },
  ViewColumn: {
    Beside: 2,
  },
}))

import { QuickOpener } from './quick-opener'

function setVscodeWorkspace(folderPaths: string[]) {
  const folders = vscode.workspace.workspaceFolders as unknown as any[]
  folders.length = 0
  folderPaths.forEach((path, index) => {
    folders.push({
      uri: { fsPath: path },
      index,
      name: path.split(/[\\/]/).pop() || 'folder',
    })
  })
}

describe('QuickOpener', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setVscodeWorkspace([])
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const instance = new QuickOpener({})
      expect(instance).toBeDefined()
      expect(instance.icons).toBe(true)
      expect(instance.prefixes).toEqual({})
      expect(instance.prefixesArray).toEqual([])
      instance.dispose()
    })

    it('should set initial directory to home directory by default', () => {
      const instance = new QuickOpener({})
      expect(instance.qp.title).toBe(`${os.homedir()}/`)
      instance.dispose()
    })

    it('should use custom initial directory if provided', () => {
      const instance = new QuickOpener({ initial: '/tmp' })
      expect(instance.qp.title).toBe('/tmp/')
      instance.dispose()
    })

    it('should set quick pick placeholder', () => {
      const instance = new QuickOpener({})
      expect(instance.qp.placeholder).toBe('Enter a relative or absolute path to open…')
      instance.dispose()
    })
  })

  describe('show()', () => {
    it('should show the quick picker', () => {
      const instance = new QuickOpener({})
      instance.show()
      expect(instance.qp.show).toHaveBeenCalled()
      instance.dispose()
    })

    it('should have correct quick pick attributes after initialization', () => {
      const instance = new QuickOpener({})
      expect(instance.qp.placeholder).toBe('Enter a relative or absolute path to open…')
      expect(instance.qp.value).toBe('')
      instance.dispose()
    })

    it('should have title set to initial directory', () => {
      const instance = new QuickOpener({
        initial: '/initial/path',
      })
      expect(instance.qp.title).toBe('/initial/path/')
      instance.dispose()
    })
  })

  describe('dispose()', () => {
    it('should dispose the quick picker', () => {
      const instance = new QuickOpener({})
      instance.dispose()
      expect(instance.qp.dispose).toHaveBeenCalled()
    })

    it('should call onDispose callback if provided', () => {
      const onDispose = vi.fn()
      const instance = new QuickOpener({ onDispose })
      instance.dispose()
      expect(onDispose).toHaveBeenCalled()
    })

    it('should handle multiple dispose calls', () => {
      const instance = new QuickOpener({})
      expect(() => {
        instance.dispose()
        instance.dispose()
        instance.dispose()
      }).not.toThrow()
    })
  })

  describe('updateRelative()', () => {
    it('should update the relative path', () => {
      const instance = new QuickOpener({})
      const initialTitle = instance.qp.title

      const newPath = instance.updateRelative('/tmp')
      expect(newPath).toBe('/tmp/')
      expect(instance.qp.title).toBe('/tmp/')
      expect(instance.qp.title).not.toBe(initialTitle)

      instance.dispose()
    })

    it('should append directory suffix to relative path', () => {
      const instance = new QuickOpener({})
      const result = instance.updateRelative('/tmp')
      // Should end with path separator (directory indicator)
      expect(result).toMatch(/[\\/]$/)
      instance.dispose()
    })

    it('should clear the quick picker value', () => {
      const instance = new QuickOpener({})
      instance.qp.value = 'some-input'
      instance.updateRelative('/tmp')
      expect(instance.qp.value).toBe('')
      instance.dispose()
    })

    it('should update the title to the absolute path', () => {
      const instance = new QuickOpener({})
      instance.updateRelative('/tmp')
      expect(instance.qp.title).toBe('/tmp/')
      instance.dispose()
    })
  })

  describe('popPath()', () => {
    it('should remove last segment of input if input has path separators', () => {
      const instance = new QuickOpener({})
      instance.qp.value = 'foo/bar/baz'
      instance.popPath()
      expect(instance.qp.value).toBe('foo/bar/')
      instance.dispose()
    })

    it('should clear input if input is single segment', () => {
      const instance = new QuickOpener({})
      instance.qp.value = 'file.txt'
      instance.popPath()
      expect(instance.qp.value).toBe('')
      instance.dispose()
    })

    it('should navigate to parent directory if input is empty', () => {
      const instance = new QuickOpener({ initial: '/tmp' })
      const initialTitle = instance.qp.title
      instance.qp.value = ''
      instance.popPath()
      // Title should have changed to a parent directory
      expect(instance.qp.title).not.toBe(initialTitle)
      instance.dispose()
    })
  })

  describe('triggerTabCompletion()', () => {
    it('should set input to active item label if one exists', () => {
      const instance = new QuickOpener({})
      const mockItem = { label: 'completed-path' }
      instance.qp.activeItems = [mockItem]
      instance.triggerTabCompletion()
      expect(instance.qp.value).toBe('completed-path')
      instance.dispose()
    })

    it('should do nothing if no active item', () => {
      const instance = new QuickOpener({})
      instance.qp.value = 'original-input'
      instance.qp.activeItems = []
      instance.triggerTabCompletion()
      expect(instance.qp.value).toBe('original-input')
      instance.dispose()
    })
  })

  describe('triggerAction()', () => {
    it('should throw error for invalid action', () => {
      const instance = new QuickOpener({})
      expect(() => {
        instance.triggerAction('invalid-action' as any)
      }).toThrow()
      instance.dispose()
    })
  })

  describe('triggerItemAction()', () => {
    it('should throw when trying to trigger action with no active items', () => {
      const instance = new QuickOpener({})
      instance.qp.activeItems = []
      expect(() => {
        instance.triggerItemAction('change')
      }).toThrow()
      instance.dispose()
    })
  })

  describe('resolveRelative()', () => {
    it('should resolve absolute paths as-is', () => {
      const instance = new QuickOpener({})
      const result = instance.resolveRelative('/absolute/path')
      expect(result).toBe('/absolute/path')
      instance.dispose()
    })

    it('should expand prefix at start of path', () => {
      const prefixes = { '~': os.homedir(), '@': '/home/projects' }
      const instance = new QuickOpener({ prefixes })
      const result = instance.resolveRelative('~/documents')
      expect(result).toBe(`${os.homedir()}/documents`)
      instance.dispose()
    })

    it('should join relative paths with current directory', () => {
      const instance = new QuickOpener({ initial: '/tmp' })
      const result = instance.resolveRelative('file.txt')
      expect(result).toBe('/tmp/file.txt')
      instance.dispose()
    })

    it('should handle relative paths with multiple segments', () => {
      const instance = new QuickOpener({ initial: '/home' })
      const result = instance.resolveRelative('user/documents')
      expect(result).toBe('/home/user/documents')
      instance.dispose()
    })

    it('should handle prefix without suffix correctly', () => {
      const prefixes = { '@': '/home/projects' }
      const instance = new QuickOpener({ prefixes })
      // Just the prefix without path segments should return relative path
      const result = instance.resolveRelative('@')
      expect(result).toBeDefined()
      instance.dispose()
    })
  })

  describe('pathForDisplay()', () => {
    let instance: QuickOpener

    beforeEach(() => {
      const prefixes = { '~': os.homedir(), '@': '/home/projects', '#': '/home/user' }
      instance = new QuickOpener({ prefixes })
    })

    afterEach(() => {
      instance.dispose()
    })

    it('should replace absolute prefix path with prefix symbol', () => {
      const absolutePath = `${os.homedir()}/documents/file.txt`
      const result = instance.pathForDisplay(absolutePath, '~')
      expect(result).toBe('~/documents/file.txt')
    })

    it('should return absolute path when no matching prefix', () => {
      const absolutePath = '/other/path/file.txt'
      const result = instance.pathForDisplay(absolutePath, '@')
      expect(result).toBe(absolutePath)
    })

    it('should handle paths without prefix parameter', () => {
      const absolutePath = '/some/absolute/path'
      const result = instance.pathForDisplay(absolutePath)
      expect(result).toBe(absolutePath)
    })

    it('should handle when prefix does not exist in prefixes object', () => {
      const absolutePath = '/home/projects/file.txt'
      const result = instance.pathForDisplay(absolutePath, 'nonexistent')
      expect(result).toBe(absolutePath)
    })

    it('should return relative path as-is', () => {
      const relativePath = 'some/relative/path'
      expect(instance.pathForDisplay(relativePath)).toBe(relativePath)
    })

    it('should shorten path with correct prefix', () => {
      expect(instance.pathForDisplay('/home/user/docs', '#')).toBe('#/docs')
    })

    it('should not shorten path for substring matches', () => {
      expect(instance.pathForDisplay('/other/home/user', '#')).toBe('/other/home/user')
    })
  })

  describe('generateItem()', () => {
    it('should create a quick pick item with label and path', () => {
      const instance = new QuickOpener({})
      const item = instance.generateItem('test-label', '/test/path', false)
      expect(item.label).toBe('test-label')
      expect(item.resourceUri).toBeDefined()
      instance.dispose()
    })

    it('should not include icon when icons are disabled', () => {
      const instance = new QuickOpener({ icons: false })
      const item = instance.generateItem('file.txt', '/path/to/file.txt', true)
      expect(item.iconPath).toBeUndefined()
      instance.dispose()
    })

    it('should include icon when icons are enabled', () => {
      const instance = new QuickOpener({ icons: true })
      const item = instance.generateItem('file.txt', '/path/to/file.txt', true)
      expect(item.iconPath).toBeDefined()
      instance.dispose()
    })

    it('should set description to space', () => {
      const instance = new QuickOpener({})
      const item = instance.generateItem('label', '/path', true)
      expect(item.description).toBe(' ')
      instance.dispose()
    })

    it('should accept custom buttons parameter', () => {
      const instance = new QuickOpener({})
      const customButtons = [{ tooltip: 'test button' }]
      const item = instance.generateItem('label', '/path', true, customButtons as any)
      expect(item.buttons).toEqual(customButtons)
      instance.dispose()
    })

    it('should set buttons to undefined when buttons=false', () => {
      const instance = new QuickOpener({})
      const item = instance.generateItem('label', '/path', true, false)
      expect(item.buttons).toBeUndefined()
      instance.dispose()
    })
  })

  describe('directoryButtons()', () => {
    it('should return buttons for regular directory', () => {
      const instance = new QuickOpener({})
      const buttons = instance.directoryButtons('/regular/directory')
      expect(Array.isArray(buttons)).toBe(true)
      expect(buttons).toHaveLength(2)
      expect(buttons).toEqual(instance.directoryButtons('/regular/directory2'))
      instance.dispose()
    })

    it('should return different buttons for workspace directory', () => {
      setVscodeWorkspace(['/workspace/dir'])
      const instance = new QuickOpener({})
      const workspaceButtons = instance.directoryButtons('/workspace/dir')
      const regularButtons = instance.directoryButtons('/other/dir')
      expect(workspaceButtons).not.toEqual(regularButtons)
      instance.dispose()
    })
  })
})
