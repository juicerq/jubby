import { useEffect, useState, type KeyboardEvent } from 'react'
import { Check, X, Tag, Plus } from 'lucide-react'
import { usePluginStorage } from '@/core/hooks/usePluginStorage'
import type { Tag as TagType, Todo, TodoStorage } from './types'

const TAG_COLORS = [
  { name: 'red', hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'yellow', hex: '#eab308' },
  { name: 'green', hex: '#22c55e' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'purple', hex: '#8b5cf6' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'gray', hex: '#6b7280' },
] as const

type TodoView = 'list' | 'tags'

const defaultStorage: TodoStorage = { todos: [], tags: [] }

function TodoPlugin() {
  const { data, setData, isLoading } = usePluginStorage<TodoStorage>('todo', defaultStorage)
  const [newTodoText, setNewTodoText] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [view, setView] = useState<TodoView>('list')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [editingTagsTodoId, setEditingTagsTodoId] = useState<string | null>(null)

  useEffect(() => {
    if (pendingDeleteId === null) return

    const timeout = setTimeout(() => {
      setPendingDeleteId(null)
    }, 1500)

    return () => clearTimeout(timeout)
  }, [pendingDeleteId])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newTodoText.trim()) {
      const newTodo: Todo = {
        id: crypto.randomUUID(),
        text: newTodoText.trim(),
        completed: false,
        createdAt: Date.now(),
        ...(selectedTagIds.length > 0 ? { tagIds: selectedTagIds } : {}),
      }
      setData((prev) => ({
        ...prev,
        todos: [...prev.todos, newTodo],
      }))
      setNewTodoText('')
      setSelectedTagIds([])
    }
  }

  const handleToggleTagSelection = (tagId: string) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId)
      }
      // Limit to 3 tags
      if (prev.length >= 3) {
        return prev
      }
      return [...prev, tagId]
    })
  }

  const handleToggle = (id: string) => {
    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      ),
    }))
  }

  const handleDeleteClick = (id: string) => {
    if (pendingDeleteId === id) {
      setData((prev) => ({
        ...prev,
        todos: prev.todos.filter((todo) => todo.id !== id),
      }))
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

  const sortedTodos = [...data.todos].sort((a, b) => b.createdAt - a.createdAt)

  const handleCreateTag = (name: string, color: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return false

    const isDuplicate = data.tags.some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    )
    if (isDuplicate) return false

    const newTag: TagType = {
      id: crypto.randomUUID(),
      name: trimmedName,
      color,
    }
    setData((prev) => ({
      ...prev,
      tags: [...prev.tags, newTag],
    }))
    return true
  }

  const handleEditTag = (id: string, name: string, color: string): boolean | string => {
    const trimmedName = name.trim()
    if (!trimmedName) return 'Name cannot be empty'

    const isDuplicate = data.tags.some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase() && t.id !== id
    )
    if (isDuplicate) return 'Tag name already exists'

    setData((prev) => ({
      ...prev,
      tags: prev.tags.map((tag) =>
        tag.id === id ? { ...tag, name: trimmedName, color } : tag
      ),
    }))
    return true
  }

  const handleDeleteTag = (id: string) => {
    setData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag.id !== id),
      todos: prev.todos.map((todo) =>
        todo.tagIds
          ? { ...todo, tagIds: todo.tagIds.filter((tagId) => tagId !== id) }
          : todo
      ),
    }))
  }

  const handleToggleTagOnTodo = (todoId: string, tagId: string) => {
    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((todo) => {
        if (todo.id !== todoId) return todo

        const currentTagIds = todo.tagIds ?? []
        if (currentTagIds.includes(tagId)) {
          // Remove tag
          return {
            ...todo,
            tagIds: currentTagIds.filter((id) => id !== tagId),
          }
        } else {
          // Add tag (limit to 3)
          if (currentTagIds.length >= 3) return todo
          return {
            ...todo,
            tagIds: [...currentTagIds, tagId],
          }
        }
      }),
    }))
  }

  if (view === 'tags') {
    return (
      <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
        <TodoPluginTagManager
          tags={data.tags}
          onBack={() => setView('list')}
          onCreateTag={handleCreateTag}
          onEditTag={handleEditTag}
          onDeleteTag={handleDeleteTag}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4" onClick={() => {
      handleCancelDelete()
      setEditingTagsTodoId(null)
    }}>
      <TodoPluginInputArea
        value={newTodoText}
        onChange={setNewTodoText}
        onKeyDown={handleKeyDown}
        onTagsClick={() => setView('tags')}
        tags={data.tags}
        selectedTagIds={selectedTagIds}
        onToggleTag={handleToggleTagSelection}
      />
      {sortedTodos.length === 0 ? (
        <TodoPluginEmptyState />
      ) : (
        <TodoPluginList
          todos={sortedTodos}
          tags={data.tags}
          onToggle={handleToggle}
          onDeleteClick={handleDeleteClick}
          pendingDeleteId={pendingDeleteId}
          editingTagsTodoId={editingTagsTodoId}
          onEditTags={setEditingTagsTodoId}
          onToggleTagOnTodo={handleToggleTagOnTodo}
        />
      )}
    </div>
  )
}

// Mini-componentes

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
  const isAtLimit = selectedTagIds.length >= 3

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
          isAtLimit={isAtLimit}
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
      className="group flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-transparent bg-white/4 transition-all duration-[180ms] ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96]"
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
  isAtLimit: boolean
}

function TodoPluginTagSelector({ tags, selectedTagIds, onToggleTag, isAtLimit }: TodoPluginTagSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id)
        const isDisabled = isAtLimit && !isSelected

        return (
          <button
            key={tag.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (!isDisabled) {
                onToggleTag(tag.id)
              }
            }}
            disabled={isDisabled}
            className={`inline-flex cursor-pointer items-center rounded px-2 py-1 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out active:scale-[0.96] ${
              isSelected
                ? 'ring-1 ring-white/30'
                : ''
            } ${
              isDisabled
                ? 'cursor-not-allowed opacity-30'
                : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: `${tag.color}${isSelected ? '40' : '20'}`,
              color: tag.color,
            }}
            title={isDisabled ? 'Maximum 3 tags allowed' : (isSelected ? `Remove ${tag.name}` : `Add ${tag.name}`)}
          >
            {tag.name}
          </button>
        )
      })}
      {isAtLimit && (
        <span className="text-[10px] text-white/30">max 3</span>
      )}
    </div>
  )
}

interface TodoPluginTagManagerProps {
  tags: TagType[]
  onBack: () => void
  onCreateTag: (name: string, color: string) => boolean
  onEditTag: (id: string, name: string, color: string) => boolean | string
  onDeleteTag: (id: string) => void
}

function TodoPluginTagManager({ tags, onBack, onCreateTag, onEditTag, onDeleteTag }: TodoPluginTagManagerProps) {
  const [newTagName, setNewTagName] = useState('')
  const [selectedColor, setSelectedColor] = useState<string>(TAG_COLORS[0].hex)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    if (!newTagName.trim()) {
      setError('Name cannot be empty')
      return
    }

    const success = onCreateTag(newTagName, selectedColor)
    if (success) {
      setNewTagName('')
      setSelectedColor(TAG_COLORS[0].hex)
      setError(null)
    } else {
      setError('Tag name already exists')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <TodoPluginTagManagerHeader onBack={onBack} />

      {/* Create tag input */}
      <div className="mb-4 shrink-0">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="New tag name..."
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value)
                setError(null)
              }}
              onKeyDown={handleKeyDown}
              maxLength={20}
              className="h-10 w-full rounded-[10px] border border-transparent bg-white/4 px-3.5 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-[180ms] ease-out placeholder:text-white/35 hover:bg-white/6 focus:border-white/15 focus:bg-white/6 focus:shadow-[0_0_0_3px_rgba(255,255,255,0.04)]"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!newTagName.trim()}
            className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[10px] border border-transparent bg-white/4 transition-all duration-[180ms] ease-out hover:border-white/10 hover:bg-white/8 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-white/4 disabled:active:scale-100"
            aria-label="Create tag"
          >
            <Plus className="h-4 w-4 text-white/50" />
          </button>
        </div>

        {/* Color selector */}
        <div className="mt-3 flex items-center gap-1.5">
          {TAG_COLORS.map((color) => (
            <button
              key={color.name}
              type="button"
              onClick={() => setSelectedColor(color.hex)}
              className={`h-6 w-6 cursor-pointer rounded-full transition-all duration-150 ease-out hover:scale-110 active:scale-95 ${
                selectedColor === color.hex
                  ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-[#0a0a0a]'
                  : ''
              }`}
              style={{ backgroundColor: color.hex }}
              aria-label={`Select ${color.name} color`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="mt-2 text-[11px] tracking-[-0.01em] text-red-400">{error}</p>
        )}
      </div>

      {/* Tag list or empty state */}
      {tags.length === 0 ? (
        <TodoPluginTagManagerEmptyState />
      ) : (
        <TodoPluginTagManagerList tags={tags} onEditTag={onEditTag} onDeleteTag={onDeleteTag} />
      )}
    </div>
  )
}

function TodoPluginTagManagerEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/35">
      <Tag className="h-7 w-7 opacity-60" />
      <p className="text-[13px] font-normal tracking-[-0.01em]">No tags yet</p>
      <p className="text-[11px] font-normal tracking-[-0.01em] opacity-70">Create your first tag above</p>
    </div>
  )
}

interface TodoPluginTagManagerListProps {
  tags: TagType[]
  onEditTag: (id: string, name: string, color: string) => boolean | string
  onDeleteTag: (id: string) => void
}

function TodoPluginTagManagerList({ tags, onEditTag, onDeleteTag }: TodoPluginTagManagerListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  // Reset pending delete after timeout
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
    <div className="-mx-2 flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
      {tags.map((tag) => (
        <TodoPluginTagManagerItem
          key={tag.id}
          tag={tag}
          isEditing={editingId === tag.id}
          isPendingDelete={pendingDeleteId === tag.id}
          onStartEdit={() => setEditingId(tag.id)}
          onCancelEdit={() => setEditingId(null)}
          onSaveEdit={(name, color) => {
            const result = onEditTag(tag.id, name, color)
            if (result === true) {
              setEditingId(null)
              return true
            }
            return result
          }}
          onDeleteClick={() => handleDeleteClick(tag.id)}
        />
      ))}
    </div>
  )
}

interface TodoPluginTagManagerItemProps {
  tag: TagType
  isEditing: boolean
  isPendingDelete: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: (name: string, color: string) => boolean | string
  onDeleteClick: () => void
}

function TodoPluginTagManagerItem({ tag, isEditing, isPendingDelete, onStartEdit, onCancelEdit, onSaveEdit, onDeleteClick }: TodoPluginTagManagerItemProps) {
  const [editName, setEditName] = useState(tag.name)
  const [editColor, setEditColor] = useState(tag.color)
  const [error, setError] = useState<string | null>(null)

  // Reset state when editing starts
  useEffect(() => {
    if (isEditing) {
      setEditName(tag.name)
      setEditColor(tag.color)
      setError(null)
    }
  }, [isEditing, tag.name, tag.color])

  const handleSave = () => {
    const result = onSaveEdit(editName, editColor)
    if (result !== true) {
      setError(result as string)
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      onCancelEdit()
    }
  }

  if (isEditing) {
    return (
      <div className="rounded-lg bg-white/4 px-2 py-2.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value)
              setError(null)
            }}
            onKeyDown={handleKeyDown}
            maxLength={20}
            autoFocus
            className="h-8 flex-1 rounded-md border border-white/10 bg-white/6 px-2.5 text-[12px] font-medium tracking-[-0.01em] text-white/95 outline-none transition-all duration-150 ease-out placeholder:text-white/35 focus:border-white/20 focus:bg-white/8"
          />
          <button
            type="button"
            onClick={handleSave}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-white/8 transition-all duration-150 ease-out hover:bg-white/12 active:scale-[0.92]"
            aria-label="Save changes"
          >
            <Check className="h-3.5 w-3.5 text-green-400" />
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-white/4 transition-all duration-150 ease-out hover:bg-white/8 active:scale-[0.92]"
            aria-label="Cancel edit"
          >
            <X className="h-3.5 w-3.5 text-white/50" />
          </button>
        </div>

        {/* Color selector */}
        <div className="mt-2.5 flex items-center gap-1.5">
          {TAG_COLORS.map((color) => (
            <button
              key={color.name}
              type="button"
              onClick={() => setEditColor(color.hex)}
              className={`h-5 w-5 cursor-pointer rounded-full transition-all duration-150 ease-out hover:scale-110 active:scale-95 ${
                editColor === color.hex
                  ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-[#0a0a0a]'
                  : ''
              }`}
              style={{ backgroundColor: color.hex }}
              aria-label={`Select ${color.name} color`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <p className="mt-2 text-[11px] tracking-[-0.01em] text-red-400">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 transition-[background] duration-150 ease-out hover:bg-white/4">
      <button
        type="button"
        onClick={onStartEdit}
        className="flex flex-1 cursor-pointer items-center gap-3 border-none bg-transparent p-0 text-left"
      >
        <span
          className="inline-flex h-6 shrink-0 items-center rounded px-2 text-[12px] font-medium tracking-[-0.01em]"
          style={{
            backgroundColor: `${tag.color}20`,
            color: tag.color,
          }}
        >
          {tag.name}
        </span>
        <span className="text-[11px] text-white/25 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100">
          Click to edit
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDeleteClick()
        }}
        className={`group/delete flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-all duration-150 ease-out active:scale-90 ${
          isPendingDelete
            ? 'bg-red-500/20 opacity-100 hover:bg-red-500/30'
            : 'opacity-0 hover:bg-red-500/15 group-hover:opacity-100'
        }`}
        aria-label={isPendingDelete ? 'Confirm delete' : 'Delete tag'}
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

function TodoPluginTagManagerHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-white/4 transition-all duration-150 ease-out hover:bg-white/8 active:scale-[0.92]"
        aria-label="Back to tasks"
      >
        <X className="h-4 w-4 text-white/50" />
      </button>
      <span className="text-[13px] font-medium tracking-[-0.01em] text-white/80">Manage Tags</span>
    </div>
  )
}

function TodoPluginEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/35">
      <div className="text-[28px] leading-none opacity-60">○</div>
      <p className="text-[13px] font-normal tracking-[-0.01em]">No tasks yet</p>
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
  onToggleTag: (tagId: string) => void
}

function TodoPluginItem({ todo, tags, onToggle, onDeleteClick, isPendingDelete, isEditingTags, onEditTags, onToggleTag }: TodoPluginItemProps) {
  // Get tags for this todo, filtering out any orphaned IDs
  const todoTags = (todo.tagIds ?? [])
    .map((tagId) => tags.find((t) => t.id === tagId))
    .filter((t): t is TagType => t !== undefined)
    .slice(0, 3) // Ensure max 3 tags

  const isAtLimit = (todo.tagIds ?? []).length >= 3
  const hasTags = tags.length > 0

  return (
    <div
      className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-[background] duration-150 ease-out hover:bg-white/4"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] transition-all duration-150 ease-out active:scale-[0.92] ${
          todo.completed
            ? 'border-white/90 bg-white/90 hover:border-white/75 hover:bg-white/75'
            : 'border-white/25 bg-transparent hover:border-white/45 hover:bg-white/4'
        }`}
        onClick={() => onToggle(todo.id)}
        aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        <Check className={`h-3 w-3 transition-all duration-150 ease-out ${todo.completed ? 'text-[#0a0a0a]' : 'text-transparent'}`} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className={`text-[13px] font-normal leading-[1.4] tracking-[-0.01em] transition-all duration-150 ease-out ${
          todo.completed ? 'text-white/35 line-through decoration-white/25' : 'text-white/90'
        }`}>{todo.text}</span>

        {/* Tags area - clickable to edit */}
        {hasTags && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onEditTags()
              }}
              className={`flex flex-wrap items-center gap-1 rounded-md border border-transparent p-0.5 -m-0.5 transition-all duration-150 ease-out ${
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
                    isCompleted={todo.completed}
                  />
                ))
              ) : (
                <span className="px-1 text-[11px] text-white/25">+ Add tags</span>
              )}
            </button>

            {/* Tag editor popover */}
            {isEditingTags && (
              <TodoPluginTagEditorPopover
                tags={tags}
                selectedTagIds={todo.tagIds ?? []}
                onToggleTag={onToggleTag}
                isAtLimit={isAtLimit}
              />
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`mt-0.5 group/delete flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-all duration-150 ease-out active:scale-90 ${
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
  isAtLimit: boolean
}

function TodoPluginTagEditorPopover({ tags, selectedTagIds, onToggleTag, isAtLimit }: TodoPluginTagEditorPopoverProps) {
  return (
    <div
      className="absolute left-0 top-full z-10 mt-1 flex max-w-[280px] flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-[#0a0a0a] p-2 shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id)
        const isDisabled = isAtLimit && !isSelected

        return (
          <button
            key={tag.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (!isDisabled) {
                onToggleTag(tag.id)
              }
            }}
            disabled={isDisabled}
            className={`inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out active:scale-[0.96] ${
              isSelected
                ? 'ring-1 ring-white/30'
                : ''
            } ${
              isDisabled
                ? 'cursor-not-allowed opacity-30'
                : 'hover:opacity-80'
            }`}
            style={{
              backgroundColor: `${tag.color}${isSelected ? '40' : '20'}`,
              color: tag.color,
            }}
            title={isDisabled ? 'Maximum 3 tags allowed' : (isSelected ? `Remove ${tag.name}` : `Add ${tag.name}`)}
          >
            {isSelected && <Check className="h-3 w-3" />}
            {tag.name}
          </button>
        )
      })}
      {isAtLimit && (
        <span className="text-[10px] text-white/30">max 3</span>
      )}
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

export { TodoPlugin }
