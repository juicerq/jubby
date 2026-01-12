import { useState, type KeyboardEvent } from 'react'
import type { PluginManifest } from '@/core/types'
import { usePluginStorage } from '@/core/hooks/usePluginStorage'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { Todo, TodoStorage } from './types'

const defaultStorage: TodoStorage = { todos: [] }

function TodoApp() {
  const { data, setData, isLoading } = usePluginStorage<TodoStorage>('todo', defaultStorage)
  const [newTodoText, setNewTodoText] = useState('')

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
    <div className="flex flex-col gap-2 p-3">
      <Input
        placeholder="Add a new task..."
        value={newTodoText}
        onChange={(e) => setNewTodoText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="mb-1"
      />
      {sortedTodos.length === 0 ? (
        <div className="flex h-32 items-center justify-center">
          <p className="text-muted-foreground">No tasks yet. Press Enter to add your first task!</p>
        </div>
      ) : (
        sortedTodos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} onToggle={handleToggle} />
        ))
      )}
    </div>
  )
}

function TodoItem({ todo, onToggle }: { todo: Todo; onToggle: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <Checkbox
        id={todo.id}
        checked={todo.completed}
        onCheckedChange={() => onToggle(todo.id)}
      />
      <label
        htmlFor={todo.id}
        className={`flex-1 text-sm ${
          todo.completed ? 'text-muted-foreground line-through' : 'text-foreground'
        }`}
      >
        {todo.text}
      </label>
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
