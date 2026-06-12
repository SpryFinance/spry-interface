import type { GetHelpHeaderProps } from 'uniswap/src/components/dialog/GetHelpHeader'
import { type GetHelpButtonProps, GetHelpHeaderContent } from 'uniswap/src/components/dialog/GetHelpHeaderContent'

// SPRY: the "Get help" button is hidden globally for the testnet phase - every
// instance links to Uniswap's support desk (helpUrl / helpRequestUrl), which is
// wrong for Spry. Hiding it at the source covers EVERY GetHelpHeader-based
// modal (claim fees, create-position review/confirm, reset-form, hook modal,
// swap dialogs) on all breakpoints in one place.
//
// RESTORE FOR MAINNET: delete the null-returning component and re-enable the
// original render below (repointed at a Spry support channel):
//
//   import { Link } from 'react-router'
//   import { GetHelpButtonUI } from 'uniswap/src/components/dialog/GetHelpButtonUI'
//   import { uniswapUrls } from 'uniswap/src/constants/urls'
//
//   function WebGetHelpButton({ url }: GetHelpButtonProps): JSX.Element {
//     return (
//       <Link to={url ?? uniswapUrls.helpUrl} style={{ textDecoration: 'none' }} target="_blank">
//         <GetHelpButtonUI
//           width="max-content"
//           animation="fast"
//           hoverStyle={{
//             backgroundColor: '$surface3Hovered',
//           }}
//           $platform-web={{
//             width: 'fit-content',
//           }}
//         />
//       </Link>
//     )
//   }
function WebGetHelpButton(_props: GetHelpButtonProps): null {
  return null
}

export function GetHelpHeader(props: GetHelpHeaderProps): JSX.Element {
  return <GetHelpHeaderContent {...props} GetHelpButton={WebGetHelpButton} backArrowHoverColor="$neutral2Hovered" />
}
