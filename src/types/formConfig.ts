export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'date'
  | 'url'
  | 'user_picker'
  | 'single_user_picker'

export type IssueStatusCatalogEntry = {
  id: string
  name: string
  order: number
  slugKey?: string
  /** Optional pill color as #rgb or #rrggbb (issue status badges / kanban). */
  color?: string
}

export interface FormFieldConfig {
  key: string
  label: string
  type: FieldType
  required: boolean
  visible: boolean
  isBuiltIn: boolean
  locked?: boolean       // true for title — cannot toggle visibility/required
  options?: string[]     // for select / multi_select; issue status: mirrors slugKey or id
  issueStatusCatalog?: IssueStatusCatalogEntry[]
  placeholder?: string
  order: number
}

export interface FormConfigJson {
  fields: FormFieldConfig[]
}

export type EntityType = 'story' | 'task' | 'issue'
