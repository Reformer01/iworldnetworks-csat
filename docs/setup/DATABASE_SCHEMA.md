# Database Schema Documentation

The I-World Networks application uses a flat collection structure in Firestore for high-performance reporting.

## Collection: `feedbacks`

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | string | Auto-generated Firestore Document ID |
| `customerName` | string | Full name of the subscriber |
| `customerEmail` | string | Valid email address |
| `category` | string | One of: `Reliability`, `Support`, `Testimonials`, `Installation`, `Billing` |
| `location` | string | One of: `Abeokuta`, `Ibadan`, `Osogbo`, `Akure` |
| `servicePlan` | string | H-Series (Residential) or U-Series (Corporate) |
| `comment` | string | Textual feedback or success story |
| `staffName` | string | Name of the support agent or technician |
| `timestamp` | number | Unix timestamp of submission |
| `status` | string | `pending` (default), `reviewed`, `escalated` |
| `ratings` | map | Category-specific metrics (1-5 scale) |

## Nested Ratings Schema

### Reliability
- `stability`: Network uptime/consistency
- `latency`: Gaming/Streaming quality
- `peakPerformance`: Performance during 7PM-11PM

### Support
- `professionalism`: Agent helpfulness
- `clarity`: Explanation quality
- `fcr`: First Contact Resolution (`Yes` or `No`)

### Installation
- `punctuality`: Arrival timing
- `quality`: Neatness of cabling/setup
- `explanation`: Equipment orientation

### Billing
- `accuracy`: Invoice clarity
- `reconnection`: Restoration speed after payment

### Testimonials
- `signal`: Wi-Fi coverage strength
- `referralSource`: How they heard about I-World

## Security Rules Logic
- **Public**: Can only `create` documents in the `feedbacks` collection. They cannot `read`, `list`, `update`, or `delete`.
- **Admin**: Authenticated supervisors have full `read`, `update`, and `delete` access to all data.
