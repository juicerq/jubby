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
