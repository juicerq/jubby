import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, X, Tag, Plus, ChevronLeft, Pencil } from 'lucide-react'
import { usePluginStorage } from '@/core/hooks/usePluginStorage'
import { cn } from '@/lib/utils'
import type { Tag as TagType, Todo, TodoStorage } from './types'

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
    }
  }

  const handleToggleTagSelection = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    )
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

  const filteredTodos = selectedTagIds.length === 0
    ? sortedTodos
    : sortedTodos.filter((todo) =>
        selectedTagIds.every((tagId) => todo.tagIds?.includes(tagId))
      )

  const handleCreateTag = (name: string, color: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) return false

    const tags = data.tags ?? []
    const isDuplicate = tags.some(
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
      tags: [...(prev.tags ?? []), newTag],
    }))
    return true
  }

  const handleEditTag = (id: string, name: string, color: string): boolean | string => {
    const trimmedName = name.trim()
    if (!trimmedName) return 'Name cannot be empty'

    const tags = data.tags ?? []
    const isDuplicate = tags.some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase() && t.id !== id
    )
    if (isDuplicate) return 'Tag name already exists'

    setData((prev) => ({
      ...prev,
      tags: (prev.tags ?? []).map((tag) =>
        tag.id === id ? { ...tag, name: trimmedName, color } : tag
      ),
    }))
    return true
  }

  const handleDeleteTag = (id: string) => {
    setSelectedTagIds((prev) => prev.filter((tagId) => tagId !== id))
    setData((prev) => ({
      ...prev,
      tags: (prev.tags ?? []).filter((tag) => tag.id !== id),
      todos: (prev.todos ?? []).map((todo) =>
        todo.tagIds
          ? { ...todo, tagIds: todo.tagIds.filter((tagId) => tagId !== id) }
          : todo
      ),
    }))
  }

  const handleToggleTagOnTodo = (todoId: string, tagId: string) => {
    setData((prev) => ({
      ...prev,
      todos: (prev.todos ?? []).map((todo) => {
        if (todo.id !== todoId) return todo

        const currentTagIds = todo.tagIds ?? []
        if (currentTagIds.includes(tagId)) {
          // Remove tag
          return {
            ...todo,
            tagIds: currentTagIds.filter((id) => id !== tagId),
          }
        } else {
          // Add tag
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
          tags={data.tags ?? []}
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
        tags={data.tags ?? []}
        selectedTagIds={selectedTagIds}
        onToggleTag={handleToggleTagSelection}
      />
      {filteredTodos.length === 0 ? (
        <TodoPluginEmptyState hasFilter={selectedTagIds.length > 0} />
      ) : (
        <TodoPluginList
          todos={filteredTodos}
          tags={data.tags ?? []}
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
            className={`inline-flex cursor-pointer items-center rounded px-2 py-1 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] ${
              isSelected ? 'ring-1 ring-white/30' : ''
            }`}
            style={{
              backgroundColor: `${tag.color}${isSelected ? '40' : '20'}`,
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

// Inline color picker - dot que expande para mini-picker horizontal
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
      {/* Main color dot */}
      <button
        type="button"
        className={cn(
          'flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full',
          'transition-all duration-150 ease-out',
          'hover:scale-110 active:scale-95'
        )}
        style={{ backgroundColor: selectedColor }}
        aria-label="Select color"
        aria-expanded={isExpanded}
      />

      {/* Expanded horizontal picker */}
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

// Create tag row - integrado como primeiro item da lista
function TodoPluginCreateTagRow({
  onCreateTag,
}: {
  onCreateTag: (name: string, color: string) => boolean
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(TAG_COLORS[0].hex)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    if (!name.trim()) return

    const success = onCreateTag(name.trim(), color)
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
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-white/4 transition-all duration-150 ease-out hover:border-white/10 hover:bg-white/8 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-transparent disabled:hover:bg-white/4"
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

// Color picker para modal de edição (versão compacta horizontal)
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
  onBack: () => void
  onCreateTag: (name: string, color: string) => boolean
  onEditTag: (id: string, name: string, color: string) => boolean | string
  onDeleteTag: (id: string) => void
}

function TodoPluginTagManager({ tags, onBack, onCreateTag, onEditTag, onDeleteTag }: TodoPluginTagManagerProps) {
  const [editingTag, setEditingTag] = useState<TagType | null>(null)

  return (
    <div className="flex h-full flex-col">
      <TodoPluginTagManagerHeader onBack={onBack} tagCount={tags.length} />

      {/* Unified list: create row + existing tags */}
      <div className="-mx-2 flex flex-1 flex-col gap-2 overflow-y-auto px-2">
        {/* Create row - always first */}
        <TodoPluginCreateTagRow onCreateTag={onCreateTag} />

        {/* Separator when there are tags */}
        {tags.length > 0 && (
          <div className="my-1 border-t border-white/[0.06]" />
        )}

        {/* Tag cards or empty hint */}
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

      {/* Edit modal */}
      <TodoPluginTagEditModal
        tag={editingTag}
        isOpen={editingTag !== null}
        onClose={() => setEditingTag(null)}
        onSave={(name, color) => {
          if (!editingTag) return false
          return onEditTag(editingTag.id, name, color)
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
    <div className="-mx-2 flex flex-1 flex-col gap-1 overflow-y-auto px-2">
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

// Tag card com barra de cor à esquerda e ações no hover
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
        'group relative flex items-center gap-3 rounded-lg',
        'border border-white/[0.04] bg-white/[0.02]',
        'px-3 py-2.5 transition-all duration-150 ease-out',
        'hover:border-white/[0.08] hover:bg-white/[0.04]',
        'hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]'
      )}
    >
      {/* Color accent bar */}
      <span
        className="absolute bottom-2 left-0 top-2 w-0.5 rounded-full"
        style={{ backgroundColor: tag.color }}
      />

      {/* Tag badge */}
      <span
        className="inline-flex items-center rounded-md px-2.5 py-1 text-[12px] font-semibold tracking-[-0.01em]"
        style={{
          backgroundColor: `${tag.color}20`,
          color: tag.color,
        }}
      >
        {tag.name}
      </span>

      {/* Action buttons */}
      <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100">
        {/* Edit button */}
        <button
          type="button"
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70 active:scale-90"
          aria-label={`Edit ${tag.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDeleteClick()
          }}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md transition-all duration-150 ease-out active:scale-90',
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

// Modal de edição de tag
interface TodoPluginTagEditModalProps {
  tag: TagType | null
  isOpen: boolean
  onClose: () => void
  onSave: (name: string, color: string) => boolean | string
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

  const handleSave = () => {
    const result = onSave(editName, editColor)
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
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <h2 id="edit-tag-title" className="text-[14px] font-medium text-white/90">
            Edit Tag
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-white/40 transition-all duration-150 ease-out hover:bg-white/8 hover:text-white/70"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Input */}
        <input
          type="text"
          value={editName}
          onChange={(e) => {
            setEditName(e.target.value)
            setError(null)
          }}
          maxLength={20}
          autoFocus
          className="h-10 w-full rounded-[10px] border border-white/10 bg-white/6 px-3.5 text-[13px] font-normal tracking-[-0.01em] text-white/95 outline-none transition-all duration-[180ms] ease-out placeholder:text-white/35 focus:border-white/20 focus:bg-white/8"
        />

        {/* Color picker */}
        <TodoPluginColorPicker selectedColor={editColor} onSelect={setEditColor} />

        {/* Error */}
        {error && <p className="mt-3 text-[11px] tracking-[-0.01em] text-red-400">{error}</p>}

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-white/6 px-4 py-2 text-[13px] font-medium text-white/70 transition-all duration-150 ease-out hover:bg-white/10 active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!editName.trim()}
            className="flex-1 rounded-lg bg-white/90 px-4 py-2 text-[13px] font-medium text-[#0a0a0a] transition-all duration-150 ease-out hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function TodoPluginTagManagerHeader({ onBack, tagCount }: { onBack: () => void; tagCount: number }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-white/[0.06] pb-3">
      <button
        type="button"
        onClick={onBack}
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-white/50 transition-all duration-150 ease-out hover:bg-white/6 hover:text-white/90 active:scale-[0.92]"
        aria-label="Back to tasks"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2">
        <h2 className="text-[14px] font-medium tracking-[-0.01em] text-white/90">Manage Tags</h2>
        {tagCount > 0 && (
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-medium text-white/50">
            {tagCount}
          </span>
        )}
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
  // Get tags for this todo, filtering out any orphaned IDs
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
                if (isEditingTags) {
                  onCloseTagEditor()
                } else {
                  onEditTags()
                }
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
                onClose={onCloseTagEditor}
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
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
        <span className="text-[11px] font-medium text-white/50">Tags</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
          aria-label="Close"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Tags */}
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
              className={`flex cursor-pointer items-center justify-center gap-1 truncate rounded px-2 py-1.5 text-[11px] font-medium tracking-[-0.01em] transition-all duration-150 ease-out hover:opacity-80 active:scale-[0.96] ${
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

export { TodoPlugin }
