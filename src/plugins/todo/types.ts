export interface Tag {
  id: string
  name: string
  color: string
}

export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: number
  tagIds?: string[]
}

export interface TodoStorage {
  todos: Todo[]
  tags: Tag[]
}
