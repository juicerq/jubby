import { useState, type KeyboardEvent } from 'react'
import type { PluginManifest } from '@/core/types'
import { usePluginStorage } from '@/core/hooks/usePluginStorage'
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
        <span className="todo-loading" />
      </div>
    )
  }

  const sortedTodos = [...data.todos].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="todo-container" onClick={handleCancelDelete}>
      <div className="todo-input-wrapper">
        <input
          type="text"
          placeholder="What needs to be done?"
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="todo-input"
          autoComplete="off"
        />
        <span className="todo-input-hint">↵</span>
      </div>

      {sortedTodos.length === 0 ? (
        <div className="todo-empty">
          <div className="todo-empty-icon">○</div>
          <p>No tasks yet</p>
        </div>
      ) : (
        <div className="todo-list">
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
      className={`todo-item ${todo.completed ? 'todo-item--completed' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`todo-checkbox ${todo.completed ? 'todo-checkbox--checked' : ''}`}
        onClick={() => onToggle(todo.id)}
        aria-label={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
      >
        <svg viewBox="0 0 16 16" className="todo-checkbox-icon">
          <path d="M4 8.5L6.5 11L12 5" />
        </svg>
      </button>

      <span className="todo-text">{todo.text}</span>

      <button
        type="button"
        className={`todo-delete ${isPendingDelete ? 'todo-delete--confirm' : ''}`}
        onClick={() => onDeleteClick(todo.id)}
        aria-label={isPendingDelete ? 'Confirm delete' : 'Delete task'}
      >
        {isPendingDelete ? (
          <svg viewBox="0 0 16 16" className="todo-delete-icon">
            <path d="M3 8.5L6.5 11L13 4" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="todo-delete-icon">
            <path d="M4 4L12 12M12 4L4 12" />
          </svg>
        )}
      </button>
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
