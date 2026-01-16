import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, X, Tag, Plus, Pencil, Minus, FolderOpen } from 'lucide-react'
import { useTodoStorage, useFolderStorage } from './useTodoStorage'
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

type TodoView = 'folders' | 'list' | 'tags'

function TodoPlugin({ onExitPlugin }: PluginProps) {
  // Folder management
  const {
    folders,
    isLoading: foldersLoading,
    createFolder,
    loadFolders,
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [editingTagsTodoId, setEditingTagsTodoId] = useState<string | null>(null)

  // Folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

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

  useEffect(() => {
    if (pendingDeleteId === null) return

    const timeout = setTimeout(() => {
      setPendingDeleteId(null)
    }, 1500)

    return () => clearTimeout(timeout)
  }, [pendingDeleteId])

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

  const handleDeleteClick = (id: string) => {
    if (pendingDeleteId === id) {
      deleteTodo(id)
      setPendingDeleteId(null)
    } else {
      setPendingDeleteId(id)
    }
  }

  const handleCancelDelete = () => {
    setPendingDeleteId(null)
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

  const handleCreateTag = async (name: string, color: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return false
    return await createTag(trimmedName, color)
  }

  const handleEditTag = async (id: string, name: string, color: string): Promise<boolean | string> => {
    const trimmedName = name.trim()
    if (!trimmedName) return 'Name cannot be empty'

    const isDuplicate = tags.some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase() && t.id !== id
    )
    if (isDuplicate) return 'Tag name already exists'

    const success = await updateTag(id, trimmedName, color)
    return success ? true : 'Failed to update tag'
  }

  const handleDeleteTag = (id: string) => {
    setSelectedTagIds((prev) => prev.filter((tagId) => tagId !== id))
    deleteTag(id)
  }

  const handleToggleTagOnTodo = (todoId: string, tagId: string) => {
    const todo = todos.find((t) => t.id === todoId)
    if (!todo) return

    const currentTagIds = todo.tagIds ?? []
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId]

    setTodoTags(todoId, newTagIds)
  }

  // Build the header right content for tags view (tag count badge)
  const tagCountBadge = view === 'tags' && tags.length > 0 ? (
    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-white/50">
      {tags.length}
    </span>
  ) : undefined

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

  // Determine header props based on current view
  const headerProps = view === 'tags'
    ? { title: 'Manage Tags', icon: Tag, onBack: () => setView('list'), right: tagCountBadge }
    : view === 'folders'
    ? { title: 'Todo', icon: FolderOpen, onBack: onExitPlugin, right: folderAddButton }
    : { title: currentFolder?.name ?? 'Tasks', icon: Check, onBack: handleNavigateToFolders }

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
            />
          )}
        </div>
      </div>
    )
  }

  if (view === 'tags') {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <PluginHeader {...headerProps} />
        <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
          <TodoPluginTagManager
            tags={tags}
            onCreateTag={handleCreateTag}
            onEditTag={handleEditTag}
            onDeleteTag={handleDeleteTag}
          />
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
      }}>
        <TodoPluginInputArea
          value={newTodoText}
          onChange={setNewTodoText}
          onKeyDown={handleKeyDown}
          onTagsClick={() => setView('tags')}
          tags={tags}
          selectedTagIds={selectedTagIds}
          onToggleTag={handleToggleTagSelection}
        />
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
            className="h-10 w-full rounded-[10px] border border-transparent bg-white/4 px-3.5 pr-9 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-[180ms] ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
            autoComplete="off"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/25 opacity-0 transition-opacity duration-[180ms] ease-out peer-focus:opacity-100 [input:focus+&]:opacity-100 [input:not(:placeholder-shown)+&]:opacity-100">↵</span>
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
      className="group flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-transparent bg-white/4 transition-all duration-[180ms] ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
      aria-label="Manage tags"
      title="Manage tags"
    >
      <Tag className="h-4 w-4 text-white/40 transition-colors duration-[180ms] ease-out group-hover:text-white/70" />
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

function TodoPluginInlineColorPicker({
  selectedColor,
  onSelect,
}: {
  selectedColor: string
  onSelect: (hex: string) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <button
        type="button"
        className={cn(
          'flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full',
          'transition-all duration-150 ease-out',
          'hover:scale-110 active:scale-95',
          'border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]'
        )}
        style={{ backgroundColor: selectedColor }}
        aria-label="Select color"
        aria-expanded={isExpanded}
      />

      <div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 flex items-center gap-1',
          'rounded-full border border-white/10 bg-[#0a0a0a] px-1 py-1',
          'transition-all duration-150 ease-out origin-left',
          isExpanded
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-95 pointer-events-none'
        )}
      >
        {TAG_COLORS.map((color) => {
          const isSelected = selectedColor === color.hex
          return (
            <button
              key={color.name}
              type="button"
              onClick={() => {
                onSelect(color.hex)
                setIsExpanded(false)
              }}
              className={cn(
                'flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full',
                'transition-all duration-100 ease-out',
                'hover:scale-110 active:scale-95',
                'border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]',
                isSelected && 'ring-1.5 ring-white/50 ring-offset-1 ring-offset-[#0a0a0a]'
              )}
              style={{ backgroundColor: color.hex }}
              aria-label={color.name}
              title={color.name}
            >
              {isSelected && (
                <Check className="h-3 w-3" style={{ color: color.contrastText }} />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TodoPluginCreateTagRow({
  onCreateTag,
}: {
  onCreateTag: (name: string, color: string) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(TAG_COLORS[0].hex)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) return

    const success = await onCreateTag(name.trim(), color)
    if (success) {
      setName('')
      setColor(TAG_COLORS[0].hex)
      setError(null)
    } else {
      setError('Tag already exists')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  const hasText = name.trim().length > 0

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <TodoPluginInlineColorPicker selectedColor={color} onSelect={setColor} />
        <input
          type="text"
          placeholder="New tag name..."
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          onKeyDown={handleKeyDown}
          maxLength={20}
          className={cn(
            'h-8 min-w-0 flex-1 rounded-lg px-3 text-[13px] tracking-[-0.01em] outline-none',
            'transition-all duration-150 ease-out',
            hasText
              ? 'font-semibold'
              : 'border border-transparent bg-white/4 font-normal text-white/95 placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6'
          )}
          style={hasText ? {
            backgroundColor: `${color}20`,
            color: color,
            boxShadow: `0 0 0 1px ${color}30`,
          } : undefined}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!hasText}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-white/4 transition-all duration-150 ease-out hover:border-white/10 hover:bg-white/8 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-white/4 active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          aria-label="Create tag"
        >
          <Plus className="h-4 w-4 text-white/50" />
        </button>
      </div>
      {error && (
        <p className="pl-8 text-[11px] text-red-400">{error}</p>
      )}
    </div>
  )
}

function TodoPluginColorPicker({
  selectedColor,
  onSelect,
}: {
  selectedColor: string
  onSelect: (hex: string) => void
}) {
  return (
    <div className="mt-3 flex items-center justify-center gap-1.5" role="radiogroup" aria-label="Tag color">
      {TAG_COLORS.map((color) => {
        const isSelected = selectedColor === color.hex
        return (
          <button
            key={color.name}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={color.name}
            title={color.name}
            onClick={() => onSelect(color.hex)}
            className={cn(
              'flex h-6 w-6 cursor-pointer items-center justify-center rounded-full',
              'transition-all duration-150 ease-out',
              'hover:scale-110 active:scale-95',
              'border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]',
              isSelected && 'ring-2 ring-offset-2 ring-offset-[#0a0a0a]'
            )}
            style={{
              backgroundColor: color.hex,
              ...(isSelected && { ['--tw-ring-color' as string]: color.hex }),
            }}
          >
            {isSelected && (
              <Check className="h-3.5 w-3.5" style={{ color: color.contrastText }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

interface TodoPluginTagManagerProps {
  tags: TagType[]
  onCreateTag: (name: string, color: string) => Promise<boolean>
  onEditTag: (id: string, name: string, color: string) => Promise<boolean | string>
  onDeleteTag: (id: string) => void
}

function TodoPluginTagManager({ tags, onCreateTag, onEditTag, onDeleteTag }: TodoPluginTagManagerProps) {
  const [editingTag, setEditingTag] = useState<TagType | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="-mx-2 flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2">
        <TodoPluginCreateTagRow onCreateTag={onCreateTag} />

        {tags.length > 0 && (
          <div className="my-1 border-t border-white/[0.06]" />
        )}

        {tags.length === 0 ? (
          <TodoPluginTagManagerEmptyHint />
        ) : (
          <TodoPluginTagManagerList
            tags={tags}
            onEditTag={(tag) => setEditingTag(tag)}
            onDeleteTag={onDeleteTag}
          />
        )}
      </div>

      <TodoPluginTagEditModal
        tag={editingTag}
        isOpen={editingTag !== null}
        onClose={() => setEditingTag(null)}
        onSave={async (name, color) => {
          if (!editingTag) return false
          return await onEditTag(editingTag.id, name, color)
        }}
      />
    </div>
  )
}

function TodoPluginTagManagerEmptyHint() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <p className="text-[12px] text-white/30">
        No tags yet. Create one above.
      </p>
    </div>
  )
}

interface TodoPluginTagManagerListProps {
  tags: TagType[]
  onEditTag: (tag: TagType) => void
  onDeleteTag: (id: string) => void
}

function TodoPluginTagManagerList({ tags, onEditTag, onDeleteTag }: TodoPluginTagManagerListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (pendingDeleteId === null) return

    const timeout = setTimeout(() => {
      setPendingDeleteId(null)
    }, 1500)

    return () => clearTimeout(timeout)
  }, [pendingDeleteId])

  const handleDeleteClick = (id: string) => {
    if (pendingDeleteId === id) {
      onDeleteTag(id)
      setPendingDeleteId(null)
    } else {
      setPendingDeleteId(id)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {tags.map((tag) => (
        <TodoPluginTagCard
          key={tag.id}
          tag={tag}
          isPendingDelete={pendingDeleteId === tag.id}
          onEdit={() => onEditTag(tag)}
          onDeleteClick={() => handleDeleteClick(tag.id)}
        />
      ))}
    </div>
  )
}

interface TodoPluginTagCardProps {
  tag: TagType
  isPendingDelete: boolean
  onEdit: () => void
  onDeleteClick: () => void
}

function TodoPluginTagCard({ tag, isPendingDelete, onEdit, onDeleteClick }: TodoPluginTagCardProps) {
  return (
    <div
      className={cn(
        'group relative flex shrink-0 items-center gap-3 rounded-lg overflow-x-hidden',
        'border border-white/[0.04] bg-white/[0.02]',
        'px-3 py-2.5 transition-all duration-150 ease-out',
        'hover:border-white/[0.08] hover:bg-white/[0.04]',
        'hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]'
      )}
    >
      <span
        className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full"
        style={{ backgroundColor: tag.color }}
      />

      <span
        className="inline-flex min-w-0 max-w-[180px] items-center truncate rounded-md px-2.5 py-1 text-[12px] font-semibold tracking-[-0.01em]"
        style={{
          backgroundColor: `${tag.color}20`,
          color: tag.color,
        }}
      >
        {tag.name}
      </span>

      <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 active:scale-90 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          aria-label={`Edit ${tag.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteClick()
          }}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 ease-out active:scale-90',
            'border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]',
            isPendingDelete
              ? 'animate-pulse bg-red-500/25 text-red-500'
              : 'text-white/40 hover:bg-red-500/15 hover:text-red-500'
          )}
          aria-label={isPendingDelete ? 'Confirm delete' : `Delete ${tag.name}`}
        >
          {isPendingDelete ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

interface TodoPluginTagEditModalProps {
  tag: TagType | null
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, color: string) => Promise<boolean | string>
}

function TodoPluginTagEditModal({ tag, isOpen, onClose, onSave }: TodoPluginTagEditModalProps) {
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tag && isOpen) {
      setEditName(tag.name)
      setEditColor(tag.color)
      setError(null)
    }
  }, [tag, isOpen])

  const handleSave = async () => {
    const result = await onSave(editName, editColor)
    if (result === true) {
      onClose()
    } else {
      setError(result as string)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter') handleSave()
  }

  if (!isOpen || !tag) return null

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-[280px] rounded-xl border border-white/10 bg-[#0a0a0a] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-tag-title"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="edit-tag-title" className="text-[14px] font-medium text-white/90">
            Edit Tag
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
          type="text"
          value={editName}
          onChange={(e) => {
            setEditName(e.target.value)
            setError(null)
          }}
          maxLength={20}
          autoFocus
          className={cn(
            'h-10 w-full rounded-[10px] px-3.5 text-[13px] tracking-[-0.01em] outline-none transition-all duration-[180ms] ease-out',
            editName.trim()
              ? 'font-semibold'
              : 'border border-white/10 bg-white/6 font-normal text-white/95 placeholder:text-white/35 focus:border-white/20 focus:bg-white/8'
          )}
          style={editName.trim() ? {
            backgroundColor: `${editColor}20`,
            color: editColor,
            boxShadow: `0 0 0 1px ${editColor}30`,
          } : undefined}
        />

        <TodoPluginColorPicker selectedColor={editColor} onSelect={setEditColor} />

        {error && <p className="mt-3 text-[11px] tracking-[-0.01em] text-red-400">{error}</p>}

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
            onClick={handleSave}
            disabled={!editName.trim()}
            className="flex-1 rounded-lg bg-white/90 px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-all duration-150 ease-out hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 border border-transparent active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
          >
            Save
          </button>
        </div>
      </div>
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
        className="h-10 w-full rounded-[10px] border border-transparent bg-white/4 px-3.5 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-[180ms] ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
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
}

function TodoPluginFolderList({ folders, onFolderClick }: TodoPluginFolderListProps) {
  // Sort folders by position
  const sortedFolders = [...folders].sort((a, b) => a.position - b.position)

  return (
    <div className="-mx-2 flex flex-1 flex-col gap-1.5 overflow-y-auto px-2">
      {sortedFolders.map((folder) => (
        <TodoPluginFolderCard
          key={folder.id}
          folder={folder}
          onClick={() => onFolderClick(folder.id)}
        />
      ))}
    </div>
  )
}

interface TodoPluginFolderCardProps {
  folder: Folder
  onClick: () => void
}

function TodoPluginFolderCard({ folder, onClick }: TodoPluginFolderCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full flex-col gap-2 rounded-lg text-left',
        'border border-white/[0.04] bg-white/[0.02]',
        'px-3.5 py-3 transition-all duration-150 ease-out',
        'hover:border-white/[0.08] hover:bg-white/[0.04]',
        'hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]',
        'active:scale-[0.99] active:border-white/15 active:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]'
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium text-white/90 tracking-[-0.01em]">
          {folder.name}
        </span>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-white/50">
          {folder.todoCount}
        </span>
      </div>

      <TodoPluginFolderPreview recentTodos={folder.recentTodos} />
    </button>
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

export { TodoPlugin }
