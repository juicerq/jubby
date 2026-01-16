export interface Tag {
  id: string
  name: string
  color: string
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface Todo {
  id: string
  text: string
  status: TodoStatus
  createdAt: number
  tagIds?: string[]
}

export interface RecentTodo {
  id: string
  text: string
  status: string
}

export interface Folder {
  id: string
  name: string
  position: number
  createdAt: number
  todoCount: number
  recentTodos: RecentTodo[]
}
