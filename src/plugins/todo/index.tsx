import type { PluginManifest } from '@/core/types'
import { usePluginStorage } from '@/core/hooks/usePluginStorage'
import { Checkbox } from '@/components/ui/checkbox'
import type { Todo, TodoStorage } from './types'

const defaultStorage: TodoStorage = { todos: [] }

function TodoApp() {
  const { data, isLoading } = usePluginStorage<TodoStorage>('todo', defaultStorage)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // Sort by createdAt descending (most recent first)
  const sortedTodos = [...data.todos].sort((a, b) => b.createdAt - a.createdAt)

  if (sortedTodos.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No tasks yet. Add your first task!</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {sortedTodos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </div>
  )
}

function TodoItem({ todo }: { todo: Todo }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
      <Checkbox
        id={todo.id}
        checked={todo.completed}
        disabled
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
