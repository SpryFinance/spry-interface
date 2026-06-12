import { ReactNode } from 'react'
import { FlexProps } from 'ui/src'
import { NotImplementedError } from 'utilities/src/errors'

export type GetHelpHeaderProps = {
  closeModal: () => void
  link?: string
  title?: ReactNode
  goBack?: () => void
  closeDataTestId?: string
  className?: string
  /** Hides the "Get help" button while keeping the title / back / close chrome. */
  hideGetHelp?: boolean
} & FlexProps

export function GetHelpHeader(_props: GetHelpHeaderProps): JSX.Element {
  throw new NotImplementedError('GetHelpHeader is implemented for web and native')
}
