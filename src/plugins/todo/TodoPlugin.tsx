import { useEffect, useState, type KeyboardEvent } from 'react'
import { Check, X, Tag } from 'lucide-react'
import { usePluginStorage } from '@/core/hooks/usePluginStorage'
import type { Todo, TodoStorage } from './types'

type TodoView = 'list' | 'tags'

const defaultStorage: TodoStorage = { todos: [], tags: [] }

function TodoPlugin() {
  const { data, setData, isLoading } = usePluginStorage<TodoStorage>('todo', defaultStorage)
  const [newTodoText, setNewTodoText] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [view, setView] = useState<TodoView>('list')

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
      }
      setData((prev) => ({
        ...prev,
        todos: [...prev.todos, newTodo],
      }))
      setNewTodoText('')
    }
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

  if (view === 'tags') {
    return (
      <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
        <TodoPluginTagManager onBack={() => setView('list')} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4" onClick={handleCancelDelete}>
      <TodoPluginInputArea
        value={newTodoText}
        onChange={setNewTodoText}
        onKeyDown={handleKeyDown}
        onTagsClick={() => setView('tags')}
      />
      {sortedTodos.length === 0 ? (
        <TodoPluginEmptyState />
      ) : (
        <TodoPluginList
          todos={sortedTodos}
          onToggle={handleToggle}
          onDeleteClick={handleDeleteClick}
          pendingDeleteId={pendingDeleteId}
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
}

function TodoPluginInputArea({ value, onChange, onKeyDown, onTagsClick }: TodoPluginInputAreaProps) {
  return (
    <div className="flex shrink-0 gap-2">
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

interface TodoPluginTagManagerProps {
  onBack: () => void
}

function TodoPluginTagManager({ onBack }: TodoPluginTagManagerProps) {
  return (
    <div className="flex h-full flex-col">
      <TodoPluginTagManagerHeader onBack={onBack} />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-white/35">
        <Tag className="h-7 w-7 opacity-60" />
        <p className="text-[13px] font-normal tracking-[-0.01em]">Tag management coming soon</p>
      </div>
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
  onToggle: (id: string) => void
  onDeleteClick: (id: string) => void
  pendingDeleteId: string | null
}

function TodoPluginList({ todos, onToggle, onDeleteClick, pendingDeleteId }: TodoPluginListProps) {
  return (
    <div className="-mx-2 flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
      {todos.map((todo) => (
        <TodoPluginItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDeleteClick={onDeleteClick}
          isPendingDelete={pendingDeleteId === todo.id}
        />
      ))}
    </div>
  )
}

interface TodoPluginItemProps {
  todo: Todo
  onToggle: (id: string) => void
  onDeleteClick: (id: string) => void
  isPendingDelete: boolean
}

function TodoPluginItem({ todo, onToggle, onDeleteClick, isPendingDelete }: TodoPluginItemProps) {
  return (
    <div
      className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-[background] duration-150 ease-out hover:bg-white/4"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border-[1.5px] transition-all duration-150 ease-out active:scale-[0.92] ${
          todo.completed
            ? 'border-white/90 bg-white/90 hover:border-white/75 hover:bg-white/75'
            : 'border-white/25 bg-transparent hover:border-white/45 hover:bg-white/4'
        }`}
        onClick={() => onToggle(todo.id)}
        aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        <Check className={`h-3 w-3 transition-all duration-150 ease-out ${todo.completed ? 'text-[#0a0a0a]' : 'text-transparent'}`} />
      </button>

      <span className={`flex-1 text-[13px] font-normal leading-[1.4] tracking-[-0.01em] transition-all duration-150 ease-out ${
        todo.completed ? 'text-white/35 line-through decoration-white/25' : 'text-white/90'
      }`}>{todo.text}</span>

      <button
        type="button"
        className={`group/delete flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-all duration-150 ease-out active:scale-90 ${
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

export { TodoPlugin }
