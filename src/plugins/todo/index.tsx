import { useState, type KeyboardEvent } from 'react'
import type { PluginManifest } from '@/core/types'
import { usePluginStorage } from '@/core/hooks/usePluginStorage'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Todo, TodoStorage } from './types'

const defaultStorage: TodoStorage = { todos: [] }

function TodoApp() {
  const { data, setData, isLoading } = usePluginStorage<TodoStorage>('todo', defaultStorage)
  const [newTodoText, setNewTodoText] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

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
      // Second click - confirm delete
      setData((prev) => ({
        ...prev,
        todos: prev.todos.filter((todo) => todo.id !== id),
      }))
      setPendingDeleteId(null)
    } else {
      // First click - enter confirmation state
      setPendingDeleteId(id)
    }
  }

  const handleCancelDelete = () => {
    setPendingDeleteId(null)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Sort by createdAt descending (most recent first)
  const sortedTodos = [...data.todos].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="flex h-full flex-col gap-2 overflow-hidden p-3" onClick={handleCancelDelete}>
      <div className="shrink-0">
        <Input
          placeholder="Add a new task..."
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="transition-all duration-150 ease-out focus:ring-2 focus:ring-ring"
        />
      </div>
      {sortedTodos.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-center text-sm text-muted-foreground">No tasks yet. Press Enter to add your first task!</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {sortedTodos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onToggle={handleToggle}
              onDeleteClick={handleDeleteClick}
              isPendingDelete={pendingDeleteId === todo.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface TodoItemProps {
  todo: Todo
  onToggle: (id: string) => void
  onDeleteClick: (id: string) => void
  isPendingDelete: boolean
}

function TodoItem({ todo, onToggle, onDeleteClick, isPendingDelete }: TodoItemProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-3 rounded-md border border-border bg-card p-3 transition-all duration-150 ease-out hover:bg-accent/50"
      onClick={(e) => e.stopPropagation()}
    >
      <Checkbox
        id={todo.id}
        checked={todo.completed}
        onCheckedChange={() => onToggle(todo.id)}
        className="transition-all duration-150 ease-out"
      />
      <label
        htmlFor={todo.id}
        className={`flex-1 cursor-pointer select-none text-sm transition-all duration-150 ease-out ${
          todo.completed ? 'text-muted-foreground line-through' : 'text-foreground'
        }`}
      >
        {todo.text}
      </label>
      <Button
        variant="ghost"
        size="icon"
        className={`h-6 w-6 shrink-0 transition-all duration-150 ease-out ${isPendingDelete ? 'scale-110 text-destructive hover:text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
        onClick={() => onDeleteClick(todo.id)}
      >
        {isPendingDelete ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        )}
      </Button>
    </div>
  )
}

export const TodoManifest: PluginManifest = {
  id: 'todo',
  name: 'Todo',
  icon: '✓',
  component: TodoApp,
  version: '1.0.0',
}
