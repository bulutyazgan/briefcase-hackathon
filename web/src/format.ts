// Agent replies and approval reasons carry raw pound amounts such as "£1080.00".
// Only an ungrouped run of four or more digits is touched, so "£1,080.00" and "£400" stay as they are.
const ungroupedPounds = /£(\d{4,})(?=\b)/g

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function formatMoneyText(text: string): string {
  return text.replace(ungroupedPounds, (_match, digits: string) => `£${groupThousands(digits)}`)
}
