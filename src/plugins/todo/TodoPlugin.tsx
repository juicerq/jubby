import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Check, X, Tag, Plus, Pencil, Minus, FolderOpen, Settings, GripVertical, Trash2 } from 'lucide-react'
import { useTodoStorage, useFolderStorage, usePendingDelete } from './useTodoStorage'
import { cn } from '@/lib/utils'
import { PluginHeader } from '@/core/components/PluginHeader'
import type { PluginProps } from '@/core/types'
import type { Tag as TagType, Todo, TodoStatus, Folder, RecentTodo } from './types'

const TAG_COLORS = [
  { name: 'Red', hex: '#ef4444', contrastText: 'white' },
  { name: 'Orange', hex: '#f97316', contrastText: 'white' },
  { name: 'Yellow', hex: '#eab308', contrastText: '#0a0a0a' },
  { name: 'Green', hex: '#22c55e', contrastText: 'white' },
  { name: 'Blue', hex: '#3b82f6', contrastText: 'white' },
  { name: 'Purple', hex: '#8b5cf6', contrastText: 'white' },
  { name: 'Pink', hex: '#ec4899', contrastText: 'white' },
  { name: 'Gray', hex: '#6b7280', contrastText: 'white' },
] as const

type TodoView = 'folders' | 'list'

function TodoPlugin({ onExitPlugin }: PluginProps) {
  // Folder management
  const {
    folders,
    isLoading: foldersLoading,
    createFolder,
    renameFolder,
    deleteFolder,
    loadFolders,
    reorderFolders,
  } = useFolderStorage()

  // Current folder state (null means we're on the folder list view)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [view, setView] = useState<TodoView>('folders')

  // Get current folder details
  const currentFolder = currentFolderId
    ? folders.find((f) => f.id === currentFolderId) ?? null
    : null

  // Todo storage - only loads when we have a folder selected
  const {
    todos,
    tags,
    isLoading: todosLoading,
    createTodo,
    updateTodoStatus,
    deleteTodo,
    setTodoTags,
    createTag,
    updateTag,
    deleteTag,
  } = useTodoStorage(currentFolderId ?? '')

  const isLoading = view === 'folders' ? foldersLoading : (foldersLoading || todosLoading)

  const [newTodoText, setNewTodoText] = useState('')
  const { pendingId: pendingDeleteId, handleDeleteClick, cancelDelete: handleCancelDelete } = usePendingDelete(deleteTodo)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [editingTagsTodoId, setEditingTagsTodoId] = useState<string | null>(null)

  // Clean up selectedTagIds when tags are deleted
  useEffect(() => {
    const validTagIds = new Set(tags.map(t => t.id))
    setSelectedTagIds(prev => {
      const filtered = prev.filter(id => validTagIds.has(id))
      return filtered.length === prev.length ? prev : filtered
    })
  }, [tags])

  // Folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

  // Folder settings menu state
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false)
  const [isRenamingFolder, setIsRenamingFolder] = useState(false)
  const [renameFolderValue, setRenameFolderValue] = useState('')
  const [isDeletingFolder, setIsDeletingFolder] = useState(false)

  // Manage tags modal state
  const [isManageTagsOpen, setIsManageTagsOpen] = useState(false)

  // Navigation handlers
  const handleNavigateToFolder = (folderId: string) => {
    setCurrentFolderId(folderId)
    setView('list')
    setSelectedTagIds([]) // Reset tag filter when entering folder
  }

  const handleNavigateToFolders = () => {
    setCurrentFolderId(null)
    setView('folders')
    loadFolders() // Refresh folder data when returning
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    await createFolder(newFolderName.trim())
    setNewFolderName('')
    setIsCreatingFolder(false)
  }

  const handleFolderInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCreateFolder()
    } else if (e.key === 'Escape') {
      setIsCreatingFolder(false)
      setNewFolderName('')
    }
  }

  const handleStartRenameFolder = () => {
    setRenameFolderValue(currentFolder?.name ?? '')
    setIsRenamingFolder(true)
    setIsSettingsMenuOpen(false)
  }

  const handleRenameFolder = async () => {
    if (!currentFolderId || !renameFolderValue.trim()) return
    await renameFolder(currentFolderId, renameFolderValue.trim())
    setIsRenamingFolder(false)
    setRenameFolderValue('')
  }

  const handleRenameFolderKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleRenameFolder()
    } else if (e.key === 'Escape') {
      setIsRenamingFolder(false)
      setRenameFolderValue('')
    }
  }

  const handleStartDeleteFolder = () => {
    setIsDeletingFolder(true)
    setIsSettingsMenuOpen(false)
  }

  const handleConfirmDeleteFolder = async () => {
    if (!currentFolderId) return
    const success = await deleteFolder(currentFolderId)
    if (success) {
      setIsDeletingFolder(false)
      handleNavigateToFolders()
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTodoText.trim()) {
      createTodo(newTodoText.trim(), selectedTagIds.length > 0 ? selectedTagIds : undefined)
      setNewTodoText('')
    }
  }

  const handleToggleTagSelection = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
  }

  const getNextStatus = (current: TodoStatus): TodoStatus => {
    switch (current) {
      case 'pending':
        return 'in_progress'
      case 'in_progress':
        return 'completed'
      case 'completed':
        return 'pending'
    }
  }

  const handleToggle = (id: string) => {
    const todo = todos.find((t) => t.id === id)
    if (todo) {
      updateTodoStatus(id, getNextStatus(todo.status))
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
      </div>
    )
  }

  const sortedTodos = [...todos].sort((a, b) => b.createdAt - a.createdAt)

  const filteredTodos = selectedTagIds.length === 0
    ? sortedTodos
    : sortedTodos.filter((todo) =>
        selectedTagIds.every((tagId) => todo.tagIds?.includes(tagId))
      )

  const handleToggleTagOnTodo = (todoId: string, tagId: string) => {
    const todo = todos.find((t) => t.id === todoId)
    if (!todo) return

    const currentTagIds = todo.tagIds ?? []
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId]

    setTodoTags(todoId, newTagIds)
  }

  // Build the header right content for folders view (+ button)
  const folderAddButton = view === 'folders' ? (
    <button
      type="button"
      onClick={() => setIsCreatingFolder(true)}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
      aria-label="Create folder"
    >
      <Plus size={16} />
    </button>
  ) : undefined

  // Build the header right content for list view (settings button)
  const folderSettingsButton = view === 'list' ? (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsSettingsMenuOpen(!isSettingsMenuOpen)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]',
          isSettingsMenuOpen && 'bg-white/6 text-white/90'
        )}
        aria-label="Folder settings"
      >
        <Settings size={16} />
      </button>
      {isSettingsMenuOpen && (
        <TodoPluginFolderSettingsMenu
          onRename={handleStartRenameFolder}
          onDelete={handleStartDeleteFolder}
          onClose={() => setIsSettingsMenuOpen(false)}
          todoCount={currentFolder?.todoCount ?? 0}
          tagCount={tags.length}
        />
      )}
    </div>
  ) : undefined

  // Determine header props based on current view
  const headerProps = view === 'folders'
    ? { title: 'Todo', icon: FolderOpen, onBack: onExitPlugin, right: folderAddButton }
    : { title: currentFolder?.name ?? 'Tasks', icon: Check, onBack: handleNavigateToFolders, right: folderSettingsButton }

  // Folders view
  if (view === 'folders') {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PluginHeader {...headerProps} />
        <div className="flex flex-1 flex-col overflow-hidden p-4">
          {isCreatingFolder && (
            <TodoPluginFolderInput
              value={newFolderName}
              onChange={setNewFolderName}
              onKeyDown={handleFolderInputKeyDown}
              onBlur={() => {
                if (!newFolderName.trim()) {
                  setIsCreatingFolder(false)
                }
              }}
            />
          )}
          {folders.length === 0 && !isCreatingFolder ? (
            <TodoPluginFoldersEmptyState onCreate={() => setIsCreatingFolder(true)} />
          ) : (
            <TodoPluginFolderList
              folders={folders}
              onFolderClick={handleNavigateToFolder}
              onReorder={reorderFolders}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PluginHeader {...headerProps} />
      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4" onClick={() => {
        handleCancelDelete()
        setEditingTagsTodoId(null)
        setIsSettingsMenuOpen(false)
      }}>
        <TodoPluginInputArea
          value={newTodoText}
          onChange={setNewTodoText}
          onKeyDown={handleKeyDown}
          onTagsClick={() => setIsManageTagsOpen(true)}
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggleTag={handleToggleTagSelection}
        />
        <h2 className="text-[12px] font-medium text-white/40 uppercase tracking-wide">Tasks</h2>
        {filteredTodos.length === 0 ? (
          <TodoPluginEmptyState hasFilter={selectedTagIds.length > 0} />
        ) : (
          <TodoPluginList
            todos={filteredTodos}
            tags={tags}
            onToggle={handleToggle}
            onDeleteClick={handleDeleteClick}
            pendingDeleteId={pendingDeleteId}
            editingTagsTodoId={editingTagsTodoId}
            onEditTags={setEditingTagsTodoId}
            onToggleTagOnTodo={handleToggleTagOnTodo}
          />
        )}
      </div>

      {isRenamingFolder && (
        <TodoPluginRenameFolderModal
          value={renameFolderValue}
          onChange={setRenameFolderValue}
          onSubmit={handleRenameFolder}
          onKeyDown={handleRenameFolderKeyDown}
          onClose={() => {
            setIsRenamingFolder(false)
            setRenameFolderValue('')
          }}
        />
      )}

      {isDeletingFolder && currentFolder && (
        <TodoPluginDeleteFolderModal
          folderName={currentFolder.name}
          todoCount={currentFolder.todoCount}
          tagCount={tags.length}
          onConfirm={handleConfirmDeleteFolder}
          onClose={() => setIsDeletingFolder(false)}
        />
      )}

      {isManageTagsOpen && (
        <TodoPluginManageTagsModal
          tags={tags}
          onCreateTag={createTag}
          onUpdateTag={updateTag}
          onDeleteTag={deleteTag}
          onClose={() => setIsManageTagsOpen(false)}
        />
      )}
    </div>
  )
}

interface TodoPluginInputAreaProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onTagsClick: () => void
  tags: TagType[]
  selectedTagIds: string[]
  onToggleTag: (tagId: string) => void
}

function TodoPluginInputArea({ value, onChange, onKeyDown, onTagsClick, tags, selectedTagIds, onToggleTag }: TodoPluginInputAreaProps) {
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="What needs to be done?"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="h-10 w-full rounded-[10px] border border-transparent bg-white/4 px-3.5 pr-9 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-180ms ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
            autoComplete="off"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/25 opacity-0 transition-opacity duration-180ms ease-out peer-focus:opacity-100 [input:focus+&]:opacity-100 [input:not(:placeholder-shown)+&]:opacity-100">↵</span>
        </div>
        <TodoPluginTagButton onClick={onTagsClick} />
      </div>
      {tags.length > 0 && (
        <TodoPluginTagSelector
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggleTag={onToggleTag}
        />
      )}
    </div>
  )
}

function TodoPluginTagButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="group flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-transparent bg-white/4 transition-all duration-180ms ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
      aria-label="Manage tags"
      title="Manage tags"
    >
      <Tag className="h-4 w-4 text-white/40 transition-colors duration-180ms ease-out group-hover:text-white/70" />
    </button>
  )
}

interface TodoPluginTagSelectorProps {
  tags: TagType[]
  selectedTagIds: string[]
  onToggleTag: (tagId: string) => void
}

function TodoPluginTagSelector({ tags, selectedTagIds, onToggleTag }: TodoPluginTagSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id)

        return (
          <button
            key={tag.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleTag(tag.id)
            }}
            className="inline-flex cursor-pointer items-center rounded px-2 py-1 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
            style={{
              backgroundColor: `${tag.color}${isSelected ? '50' : '20'}`,
              color: tag.color,
            }}
            title={isSelected ? `Remove ${tag.name} filter` : `Filter by ${tag.name}`}
          >
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}

function TodoPluginEmptyState({ hasFilter = false }: { hasFilter?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/35">
      <div className="text-[28px] leading-none opacity-60">○</div>
      <p className="text-[13px] font-normal tracking-[-0.01em]">
        {hasFilter ? 'No tasks match the filter' : 'No tasks yet'}
      </p>
    </div>
  )
}

interface TodoPluginListProps {
  todos: Todo[]
  tags: TagType[]
  onToggle: (id: string) => void
  onDeleteClick: (id: string) => void
  pendingDeleteId: string | null
  editingTagsTodoId: string | null
  onEditTags: (todoId: string | null) => void
  onToggleTagOnTodo: (todoId: string, tagId: string) => void
}

function TodoPluginList({ todos, tags, onToggle, onDeleteClick, pendingDeleteId, editingTagsTodoId, onEditTags, onToggleTagOnTodo }: TodoPluginListProps) {
  return (
    <div className="-mx-2 flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
      {todos.map((todo) => (
        <TodoPluginItem
          key={todo.id}
          todo={todo}
          tags={tags}
          onToggle={onToggle}
          onDeleteClick={onDeleteClick}
          isPendingDelete={pendingDeleteId === todo.id}
          isEditingTags={editingTagsTodoId === todo.id}
          onEditTags={() => onEditTags(todo.id)}
          onCloseTagEditor={() => onEditTags(null)}
          onToggleTag={(tagId) => onToggleTagOnTodo(todo.id, tagId)}
        />
      ))}
    </div>
  )
}

interface TodoPluginItemProps {
  todo: Todo
  tags: TagType[]
  onToggle: (id: string) => void
  onDeleteClick: (id: string) => void
  isPendingDelete: boolean
  isEditingTags: boolean
  onEditTags: () => void
  onCloseTagEditor: () => void
  onToggleTag: (tagId: string) => void
}

function TodoPluginItem({ todo, tags, onToggle, onDeleteClick, isPendingDelete, isEditingTags, onEditTags, onCloseTagEditor, onToggleTag }: TodoPluginItemProps) {
  const todoTags = (todo.tagIds ?? [])
    .map((tagId) => tags.find((t) => t.id === tagId))
    .filter((t): t is TagType => t !== undefined)

  const hasTags = tags.length > 0

  return (
    <div
      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-[background] duration-150 ease-out hover:bg-white/4"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={cn(
          'mt-0.5 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] transition-all duration-150 ease-out active:scale-[0.92]',
          'active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]',
          todo.status === 'completed' && 'border-white/90 bg-white/90 hover:border-white/75 hover:bg-white/75',
          todo.status === 'in_progress' && 'border-amber-500 bg-amber-500/20 hover:border-amber-400 hover:bg-amber-500/30',
          todo.status === 'pending' && 'border-white/25 bg-transparent hover:border-white/45 hover:bg-white/4'
        )}
        onClick={() => onToggle(todo.id)}
        aria-label={
          todo.status === 'pending' ? 'Mark as in progress' :
          todo.status === 'in_progress' ? 'Mark as complete' :
          'Mark as pending'
        }
      >
        {todo.status === 'completed' && <Check className="h-3 w-3 text-[#0a0a0a]" />}
        {todo.status === 'in_progress' && <Minus className="h-3 w-3 text-amber-500" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={cn(
          'text-[13px] font-normal leading-[1.4] tracking-[-0.01em] transition-all duration-150 ease-out',
          todo.status === 'completed' && 'text-white/35 line-through decoration-white/25',
          todo.status === 'in_progress' && 'text-amber-200/90',
          todo.status === 'pending' && 'text-white/90'
        )}>{todo.text}</span>

        {hasTags && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (isEditingTags) {
                  onCloseTagEditor()
                } else {
                  onEditTags()
                }
              }}
              className={`flex flex-wrap items-center gap-1 rounded-md border border-transparent p-0.5 -m-0.5 transition-all duration-150 ease-out active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)] ${
                isEditingTags
                  ? 'border-white/15 bg-white/4'
                  : 'hover:border-white/10 hover:bg-white/4'
              }`}
              aria-label="Edit tags"
            >
              {todoTags.length > 0 ? (
                todoTags.map((tag) => (
                  <TodoPluginTagBadge
                    key={tag.id}
                    tag={tag}
                    isCompleted={todo.status === 'completed'}
                  />
                ))
              ) : (
                <span className="px-1 text-[11px] text-white/25">+ Add tags</span>
              )}
            </button>

            {isEditingTags && (
              <TodoPluginTagEditorPopover
                tags={tags}
                selectedTagIds={todo.tagIds ?? []}
                onToggleTag={onToggleTag}
                onClose={onCloseTagEditor}
              />
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`mt-0.5 group/delete flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent transition-all duration-150 ease-out active:scale-90 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)] ${
          isPendingDelete
            ? 'bg-red-500/20 opacity-100 hover:bg-red-500/30'
            : 'opacity-0 hover:bg-red-500/15 group-hover:opacity-100'
        }`}
        onClick={() => onDeleteClick(todo.id)}
        aria-label={isPendingDelete ? 'Confirm delete' : 'Delete task'}
      >
        {isPendingDelete ? (
          <Check className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <X className="h-3.5 w-3.5 text-white/40 transition-colors duration-150 ease-out group-hover/delete:text-red-500" />
        )}
      </button>
    </div>
  )
}

interface TodoPluginTagEditorPopoverProps {
  tags: TagType[]
  selectedTagIds: string[]
  onToggleTag: (tagId: string) => void
  onClose: () => void
}

function TodoPluginTagEditorPopover({ tags, selectedTagIds, onToggleTag, onClose }: TodoPluginTagEditorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-10 mt-1 flex w-[280px] flex-col rounded-lg border border-white/10 bg-[#0a0a0a] shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
        <span className="text-[11px] font-medium text-white/50">Tags</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          aria-label="Close"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 p-2">
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id)

          return (
            <button
              key={tag.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleTag(tag.id)
              }}
              className={`flex cursor-pointer items-center justify-center gap-1 truncate rounded px-2 py-1.5 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)] ${
                isSelected ? 'ring-1 ring-white/30' : ''
              }`}
              style={{
                backgroundColor: `${tag.color}${isSelected ? '40' : '20'}`,
                color: tag.color,
              }}
              title={isSelected ? `Remove ${tag.name}` : `Add ${tag.name}`}
            >
              {isSelected && <Check className="h-3 w-3 shrink-0" />}
              <span className="truncate">{tag.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface TodoPluginTagBadgeProps {
  tag: TagType
  isCompleted?: boolean
}

function TodoPluginTagBadge({ tag, isCompleted = false }: TodoPluginTagBadgeProps) {
  return (
    <span
      className={`inline-flex max-w-[80px] items-center truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight tracking-[-0.01em] transition-opacity duration-150 ease-out ${
        isCompleted ? 'opacity-40' : 'opacity-100'
      }`}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
      }}
      title={tag.name}
    >
      {tag.name}
    </span>
  )
}

// --- Folder Components ---

interface TodoPluginFolderInputProps {
  value: string
  onChange: (value: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onBlur: () => void
}

function TodoPluginFolderInput({ value, onChange, onKeyDown, onBlur }: TodoPluginFolderInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="mb-3">
      <input
        ref={inputRef}
        type="text"
        placeholder="Folder name..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className="h-10 w-full rounded-[10px] border border-transparent bg-white/4 px-3.5 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-180ms ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
        autoComplete="off"
      />
    </div>
  )
}

function TodoPluginFoldersEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-white/35">
      <FolderOpen className="h-10 w-10 opacity-40" />
      <p className="text-[13px] font-normal tracking-[-0.01em]">
        No folders yet
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-[12px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/12 active:scale-[0.96] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
      >
        <Plus className="h-3.5 w-3.5" />
        Create folder
      </button>
    </div>
  )
}

interface TodoPluginFolderListProps {
  folders: Folder[]
  onFolderClick: (folderId: string) => void
  onReorder: (folderIds: string[]) => void
}

function TodoPluginFolderList({ folders, onFolderClick, onReorder }: TodoPluginFolderListProps) {
  // Sort folders by position
  const sortedFolders = [...folders].sort((a, b) => a.position - b.position)

  // Drag state using mouse events (HTML5 drag API is broken in Tauri/WebKitGTK on Linux)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)
  const [isActiveDrag, setIsActiveDrag] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)

  // Get the dragged folder for ghost rendering
  const draggedFolder = useMemo(() => {
    if (!draggedId) return null
    return sortedFolders.find((f) => f.id === draggedId) ?? null
  }, [sortedFolders, draggedId])

  // Calculate where the ghost should appear (index in the list)
  // Returns -1 if ghost shouldn't be shown (e.g., when it would be adjacent to dragged card)
  const ghostInsertIndex = useMemo(() => {
    if (!isActiveDrag || !draggedId || !dragOverId || !dropPosition) return -1

    const draggedIndex = sortedFolders.findIndex((f) => f.id === draggedId)
    const targetIndex = sortedFolders.findIndex((f) => f.id === dragOverId)
    if (draggedIndex === -1 || targetIndex === -1) return -1

    const insertIndex = dropPosition === 'above' ? targetIndex : targetIndex + 1

    // Don't show ghost if it would appear directly above or below the dragged card
    // (insertIndex === draggedIndex means directly above, insertIndex === draggedIndex + 1 means directly below)
    if (insertIndex === draggedIndex || insertIndex === draggedIndex + 1) {
      return -1
    }

    return insertIndex
  }, [sortedFolders, isActiveDrag, draggedId, dragOverId, dropPosition])

  const handleMouseDown = (e: React.MouseEvent, folderId: string) => {
    // Only start drag tracking on left click
    if (e.button !== 0) return
    dragStartPos.current = { x: e.clientX, y: e.clientY }
    setDraggedId(folderId)
  }

  // Store original card positions when drag starts (for stable hit detection)
  const originalPositions = useRef<Map<string, { top: number; bottom: number; midY: number }>>(new Map())
  const lastDropTarget = useRef<{ id: string; position: 'above' | 'below' } | null>(null)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!draggedId || !dragStartPos.current) return

      // Require 5px movement to start actual drag (prevents accidental drags on click)
      const dx = e.clientX - dragStartPos.current.x
      const dy = e.clientY - dragStartPos.current.y
      if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) < 5) return

      if (!isDraggingRef.current) {
        isDraggingRef.current = true
        setIsActiveDrag(true)
        document.body.classList.add('dragging-folder')

        // Capture original positions of all cards at drag start
        originalPositions.current.clear()
        for (const [folderId, cardEl] of cardRefs.current.entries()) {
          const rect = cardEl.getBoundingClientRect()
          originalPositions.current.set(folderId, {
            top: rect.top,
            bottom: rect.bottom,
            midY: rect.top + rect.height / 2,
          })
        }
      }

      let foundTarget = false
      const cursorY = e.clientY

      const sortedCards = Array.from(originalPositions.current.entries())
        .filter(([id]) => id !== draggedId)
        .sort((a, b) => a[1].top - b[1].top)

      // Hysteresis prevents flickering when cursor is near zone boundaries
      const hysteresis = lastDropTarget.current ? 8 : 0

      for (let i = 0; i < sortedCards.length; i++) {
        const [folderId, pos] = sortedCards[i]
        const isCurrentTarget = lastDropTarget.current?.id === folderId

        const prevCard = i > 0 ? sortedCards[i - 1][1] : null
        const nextCard = i < sortedCards.length - 1 ? sortedCards[i + 1][1] : null

        const aboveZoneTop = prevCard ? prevCard.midY : pos.top - 100
        const aboveZoneBottom = pos.midY
        const belowZoneTop = pos.midY
        const belowZoneBottom = nextCard ? nextCard.midY : pos.bottom + 100

        const aboveTopThreshold = isCurrentTarget && lastDropTarget.current?.position === 'above'
          ? aboveZoneTop - hysteresis
          : aboveZoneTop
        const belowBottomThreshold = isCurrentTarget && lastDropTarget.current?.position === 'below'
          ? belowZoneBottom + hysteresis
          : belowZoneBottom

        if (cursorY >= aboveTopThreshold && cursorY < aboveZoneBottom) {
          if (dragOverId !== folderId || dropPosition !== 'above') {
            setDragOverId(folderId)
            setDropPosition('above')
            lastDropTarget.current = { id: folderId, position: 'above' }
          }
          foundTarget = true
          break
        }

        if (cursorY >= belowZoneTop && cursorY <= belowBottomThreshold) {
          if (dragOverId !== folderId || dropPosition !== 'below') {
            setDragOverId(folderId)
            setDropPosition('below')
            lastDropTarget.current = { id: folderId, position: 'below' }
          }
          foundTarget = true
          break
        }
      }

      if (!foundTarget) {
        setDragOverId(null)
        setDropPosition(null)
        lastDropTarget.current = null
      }
    },
    [draggedId, dragOverId, dropPosition]
  )

  const handleMouseUp = useCallback(() => {
    if (draggedId && isDraggingRef.current && dragOverId && dropPosition) {
      // Perform the reorder
      const newOrder = [...sortedFolders]
      const draggedIndex = newOrder.findIndex((f) => f.id === draggedId)
      const targetIndex = newOrder.findIndex((f) => f.id === dragOverId)

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [draggedItem] = newOrder.splice(draggedIndex, 1)

        let insertIndex = targetIndex
        if (dropPosition === 'below') {
          insertIndex = draggedIndex < targetIndex ? targetIndex : targetIndex + 1
        } else {
          insertIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex
        }

        newOrder.splice(insertIndex, 0, draggedItem)
        onReorder(newOrder.map((f) => f.id))
      }
    }

    // Reset state
    setDraggedId(null)
    setDragOverId(null)
    setDropPosition(null)
    setIsActiveDrag(false)
    dragStartPos.current = null
    isDraggingRef.current = false
    originalPositions.current.clear()
    lastDropTarget.current = null
    document.body.classList.remove('dragging-folder')
  }, [draggedId, dragOverId, dropPosition, sortedFolders, onReorder])

  // Global mouse event listeners for drag
  useEffect(() => {
    if (draggedId) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [draggedId, handleMouseMove, handleMouseUp])

  const setCardRef = useCallback((folderId: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(folderId, el)
    } else {
      cardRefs.current.delete(folderId)
    }
  }, [])

  // Build render items: all folders stay in place, ghost inserted at drop position
  const renderItems = useMemo(() => {
    const items: Array<{ type: 'folder' | 'ghost'; folder: Folder; key: string }> = []

    sortedFolders.forEach((folder, index) => {
      // Insert ghost before this folder if this is the ghost position
      if (ghostInsertIndex === index && draggedFolder) {
        items.push({ type: 'ghost', folder: draggedFolder, key: 'ghost' })
      }

      // Always render the folder (including dragged one - it just gets faded)
      items.push({ type: 'folder', folder, key: folder.id })
    })

    // Ghost at the end (after all folders)
    if (ghostInsertIndex === sortedFolders.length && draggedFolder) {
      items.push({ type: 'ghost', folder: draggedFolder, key: 'ghost' })
    }

    return items
  }, [sortedFolders, ghostInsertIndex, draggedFolder])

  return (
    <div ref={containerRef} className="-mx-2 flex flex-1 flex-col gap-1.5 overflow-y-auto px-2">
      <AnimatePresence mode="popLayout">
        {renderItems.map((item) => {
          if (item.type === 'ghost') {
            return (
              <motion.div
                key="ghost"
                initial={{ opacity: 0, scale: 0.95, height: 0 }}
                animate={{ opacity: 1, scale: 1, height: 'auto' }}
                exit={{ opacity: 0, scale: 0.95, height: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                <TodoPluginFolderGhost folder={item.folder} />
              </motion.div>
            )
          }

          return (
            <motion.div
              key={item.key}
              layout
              layoutId={item.folder.id}
              transition={{
                layout: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }
              }}
            >
              <TodoPluginFolderCard
                folder={item.folder}
                onClick={() => {
                  // Only trigger click if not dragging
                  if (!isDraggingRef.current) {
                    onFolderClick(item.folder.id)
                  }
                }}
                isDragging={draggedId === item.folder.id && isDraggingRef.current}
                onMouseDown={(e) => handleMouseDown(e, item.folder.id)}
                cardRef={(el) => setCardRef(item.folder.id, el)}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

interface TodoPluginFolderCardProps {
  folder: Folder
  onClick: () => void
  isDragging?: boolean
  onMouseDown?: (e: React.MouseEvent) => void
  cardRef?: (el: HTMLDivElement | null) => void
}

function TodoPluginFolderCard({
  folder,
  onClick,
  isDragging = false,
  onMouseDown,
  cardRef,
}: TodoPluginFolderCardProps) {
  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseDown={onMouseDown}
      className={cn(
        'group flex w-full flex-col gap-2 rounded-lg text-left cursor-pointer select-none',
        'border border-white/[0.04] bg-white/[0.02]',
        'px-3.5 py-3 transition-all duration-150 ease-out',
        'hover:border-white/[0.08] hover:bg-white/[0.04]',
        'hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]',
        'active:scale-[0.99] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20',
        isDragging && 'opacity-40 scale-[0.97] pointer-events-none'
      )}
    >
      <div className="flex items-center gap-2">
        <GripVertical
          size={14}
          className="shrink-0 text-white/20 transition-colors duration-150 group-hover:text-white/40 cursor-grab"
        />
        <span className="flex-1 text-[14px] font-medium text-white/90 tracking-[-0.01em]">
          {folder.name}
        </span>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-white/50">
          {folder.todoCount}
        </span>
      </div>

      <div className="pl-5">
        <TodoPluginFolderPreview recentTodos={folder.recentTodos} />
      </div>
    </div>
  )
}

// Ghost folder shown at drop position during drag
interface TodoPluginFolderGhostProps {
  folder: Folder
}

function TodoPluginFolderGhost({ folder }: TodoPluginFolderGhostProps) {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-2 rounded-lg select-none',
        'border border-dashed border-white/20',
        'bg-gradient-to-b from-white/[0.06] to-white/[0.02]',
        'px-3.5 py-3',
        'shadow-[0_0_20px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.05)]'
      )}
    >
      <div className="flex items-center gap-2">
        <GripVertical
          size={14}
          className="shrink-0 text-white/30"
        />
        <span className="flex-1 text-[14px] font-medium text-white/60 tracking-[-0.01em]">
          {folder.name}
        </span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/40">
          {folder.todoCount}
        </span>
      </div>

      <div className="pl-5 opacity-50">
        <TodoPluginFolderPreview recentTodos={folder.recentTodos} />
      </div>
    </div>
  )
}

interface TodoPluginFolderPreviewProps {
  recentTodos: RecentTodo[]
}

function TodoPluginFolderPreview({ recentTodos }: TodoPluginFolderPreviewProps) {
  if (recentTodos.length === 0) {
    return (
      <span className="text-[12px] text-white/25 italic">
        (empty)
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {recentTodos.map((todo) => (
        <div key={todo.id} className="flex items-center gap-2">
          <span
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              todo.status === 'completed' && 'bg-white/30',
              todo.status === 'in_progress' && 'bg-amber-500/70',
              todo.status === 'pending' && 'bg-white/40'
            )}
          />
          <span
            className={cn(
              'truncate text-[12px] tracking-[-0.01em]',
              todo.status === 'completed'
                ? 'text-white/30 line-through decoration-white/20'
                : 'text-white/50'
            )}
          >
            {todo.text}
          </span>
        </div>
      ))}
    </div>
  )
}

// --- Folder Settings Components ---

interface TodoPluginFolderSettingsMenuProps {
  onRename: () => void
  onDelete: () => void
  onClose: () => void
  todoCount: number
  tagCount: number
}

function TodoPluginFolderSettingsMenu({
  onRename,
  onDelete,
  onClose,
  todoCount,
  tagCount,
}: TodoPluginFolderSettingsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full z-20 mt-1 w-[180px] rounded-lg border border-white/10 bg-[#0a0a0a] py-1 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onRename}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-white/80 transition-colors hover:bg-white/6"
      >
        <Pencil size={14} className="text-white/50" />
        Rename
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-400 transition-colors hover:bg-red-500/10"
      >
        <X size={14} />
        Delete
      </button>
      <div className="mx-2 my-1 border-t border-white/[0.06]" />
      <div className="px-3 py-1.5 text-[11px] text-white/30">
        {todoCount} task{todoCount !== 1 ? 's' : ''}, {tagCount} tag{tagCount !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

interface TodoPluginRenameFolderModalProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onClose: () => void
}

function TodoPluginRenameFolderModal({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  onClose,
}: TodoPluginRenameFolderModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[280px] rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-folder-title"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="rename-folder-title" className="text-[14px] font-medium text-white/90">
            Rename Folder
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-[10px] border border-white/10 bg-white/6 px-3.5 text-[13px] tracking-[-0.01em] text-white/95 outline-none transition-all duration-180ms ease-out placeholder:text-white/35 focus:border-white/20 focus:bg-white/8"
          autoComplete="off"
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-white/6 px-4 py-2 text-[13px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/10 active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!value.trim()}
            className="flex-1 rounded-lg bg-white/90 px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-all duration-150 ease-out hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Delete Folder Modal with Countdown ---

interface TodoPluginDeleteFolderModalProps {
  folderName: string
  todoCount: number
  tagCount: number
  onConfirm: () => void
  onClose: () => void
}

function TodoPluginDeleteFolderModal({
  folderName,
  todoCount,
  tagCount,
  onConfirm,
  onClose,
}: TodoPluginDeleteFolderModalProps) {
  const [countdown, setCountdown] = useState(3)

  useEffect(() => {
    if (countdown <= 0) return

    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [countdown])

  const isDeleteEnabled = countdown <= 0

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[300px] rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-folder-title"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="delete-folder-title" className="text-[14px] font-medium text-white/90">
            Delete Folder
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[13px] text-white/70 leading-relaxed">
          Delete <span className="font-medium text-white/90">{folderName}</span>?{' '}
          This will remove {todoCount} task{todoCount !== 1 ? 's' : ''} and {tagCount} tag{tagCount !== 1 ? 's' : ''}.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-white/6 px-4 py-2 text-[13px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/10 active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!isDeleteEnabled}
            className={cn(
              'flex-1 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-150 ease-out active:scale-[0.98] border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]',
              isDeleteEnabled
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-red-500/40 text-white/50 cursor-not-allowed'
            )}
          >
            {isDeleteEnabled ? 'Delete' : `Delete (${countdown}s)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Manage Tags Modal ---

interface TodoPluginManageTagsModalProps {
  tags: TagType[]
  onCreateTag: (name: string, color: string) => Promise<boolean>
  onUpdateTag: (id: string, name: string, color: string) => Promise<boolean>
  onDeleteTag: (id: string) => Promise<void>
  onClose: () => void
}

function TodoPluginManageTagsModal({
  tags,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onClose,
}: TodoPluginManageTagsModalProps) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[300px] rounded-xl border border-white/10 bg-[#0a0a0a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-tags-title"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <h2 id="manage-tags-title" className="text-[14px] font-medium text-white/90">
            Manage Tags
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <TodoPluginCreateTagRow onCreateTag={onCreateTag} />

          <div className="mt-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-white/40">
              Tags
            </span>
          </div>

          <div className="mt-2 max-h-[250px] overflow-y-auto">
            {tags.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span className="text-[13px] text-white/35">No tags yet</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {tags.map((tag) => (
                  <TodoPluginManageTagRow
                    key={tag.id}
                    tag={tag}
                    allTags={tags}
                    onUpdateTag={onUpdateTag}
                    onDeleteTag={onDeleteTag}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface TodoPluginCreateTagRowProps {
  onCreateTag: (name: string, color: string) => Promise<boolean>
}

function TodoPluginCreateTagRow({ onCreateTag }: TodoPluginCreateTagRowProps) {
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState<string>(TAG_COLORS[0].hex)
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) return

    const success = await onCreateTag(name.trim(), selectedColor)
    if (success) {
      setName('')
      setSelectedColor(TAG_COLORS[0].hex)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-white/4 transition-all duration-150 ease-out hover:bg-white/8 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          aria-label="Select color"
        >
          <span
            className="h-4 w-4 rounded-full"
            style={{ backgroundColor: selectedColor }}
          />
        </button>

        {isColorPickerOpen && (
          <TodoPluginColorPickerDropdown
            selectedColor={selectedColor}
            onSelectColor={(color) => {
              setSelectedColor(color)
              setIsColorPickerOpen(false)
            }}
            onClose={() => setIsColorPickerOpen(false)}
          />
        )}
      </div>

      <input
        type="text"
        placeholder="New tag..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={20}
        className="h-8 flex-1 rounded-md border border-transparent bg-white/4 px-2.5 text-[13px] text-white/90 outline-none transition-all duration-150 ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6"
        autoComplete="off"
      />

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!name.trim()}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-transparent bg-white/4 text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-40 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
        aria-label="Create tag"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

interface TodoPluginManageTagRowProps {
  tag: TagType
  allTags: TagType[]
  onUpdateTag: (id: string, name: string, color: string) => Promise<boolean>
  onDeleteTag: (id: string) => Promise<void>
}

function TodoPluginManageTagRow({ tag, allTags, onUpdateTag, onDeleteTag }: TodoPluginManageTagRowProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(tag.name)
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false)
  const { pendingId, handleDeleteClick, cancelDelete } = usePendingDelete(onDeleteTag)
  const isPendingDelete = pendingId === tag.id
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const isDuplicate = allTags.some(
    (t) => t.id !== tag.id && t.name.toLowerCase() === editName.trim().toLowerCase()
  )
  const isEmpty = !editName.trim()
  const hasError = isDuplicate || isEmpty

  const startEditing = () => {
    setIsEditing(true)
    setEditName(tag.name)
    cancelDelete()
  }

  const saveEdit = async () => {
    if (hasError) return
    if (editName.trim() !== tag.name) {
      await onUpdateTag(tag.id, editName.trim(), tag.color)
    }
    setIsEditing(false)
  }

  const cancelEdit = () => {
    setIsEditing(false)
    setEditName(tag.name)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (!isEditing) return

    const handleClickOutside = (event: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(event.target as Node)) {
        saveEdit()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isEditing, editName, hasError])

  const handleColorSelect = async (color: string) => {
    setIsColorPickerOpen(false)
    await onUpdateTag(tag.id, tag.name, color)
  }

  return (
    <div
      ref={rowRef}
      className="group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-white/4"
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsColorPickerOpen(!isColorPickerOpen)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent transition-all duration-150 ease-out hover:bg-white/8 active:border-white/15"
          aria-label="Change color"
        >
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
        </button>

        {isColorPickerOpen && (
          <TodoPluginColorPickerDropdown
            selectedColor={tag.color}
            onSelectColor={handleColorSelect}
            onClose={() => setIsColorPickerOpen(false)}
          />
        )}
      </div>

      {isEditing ? (
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={20}
              className={cn(
                'h-6 w-full rounded border bg-white/6 px-2 text-[12px] text-white/90 outline-none transition-all duration-150',
                hasError
                  ? 'border-red-500/50 focus:border-red-500'
                  : 'border-transparent focus:border-white/20'
              )}
              autoComplete="off"
            />
            {isDuplicate && (
              <span className="mt-0.5 text-[10px] text-red-400">Name already exists</span>
            )}
          </div>

          <button
            type="button"
            onClick={saveEdit}
            disabled={hasError}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-green-400 disabled:cursor-not-allowed disabled:opacity-40 active:border-white/15"
            aria-label="Save"
          >
            <Check className="h-3 w-3" />
          </button>

          <button
            type="button"
            onClick={cancelEdit}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent text-white/50 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 active:border-white/15"
            aria-label="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={startEditing}
            className="min-w-0 flex-1 truncate text-left text-[12px] text-white/80 transition-colors hover:text-white/95"
          >
            {tag.name}
          </button>

          <button
            type="button"
            onClick={() => handleDeleteClick(tag.id)}
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-transparent transition-all duration-150 ease-out active:border-white/15',
              isPendingDelete
                ? 'bg-red-500/20 text-red-500'
                : 'text-white/30 opacity-0 hover:bg-white/8 hover:text-red-400 group-hover:opacity-100'
            )}
            aria-label={isPendingDelete ? 'Confirm delete' : 'Delete tag'}
          >
            {isPendingDelete ? (
              <Check className="h-3 w-3" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        </>
      )}
    </div>
  )
}

interface TodoPluginColorPickerDropdownProps {
  selectedColor: string
  onSelectColor: (color: string) => void
  onClose: () => void
}

function TodoPluginColorPickerDropdown({
  selectedColor,
  onSelectColor,
  onClose,
}: TodoPluginColorPickerDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div
      ref={dropdownRef}
      className="absolute left-0 top-full z-50 mt-1 w-max rounded-lg border border-white/10 bg-[#0a0a0a] p-2 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-4 gap-1">
        {TAG_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            onClick={() => onSelectColor(color.hex)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md border transition-all duration-150 ease-out hover:scale-110',
              selectedColor === color.hex
                ? 'border-white/40'
                : 'border-transparent hover:border-white/20'
            )}
            aria-label={color.name}
            title={color.name}
          >
            <span
              className="h-3.5 w-3.5 rounded-full"
              style={{ backgroundColor: color.hex }}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export { TodoPlugin, TAG_COLORS }
