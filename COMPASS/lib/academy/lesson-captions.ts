import type { CourseAttachment } from '@/lib/types/learning'

/** A legacy one-video/one-VTT lesson is unambiguous; multi-video lessons need an explicit link. */
export function lessonCaptionForVideo(attachments: CourseAttachment[], videoId: string): CourseAttachment | undefined {
    const captions = attachments.filter(item => item.asset_id && item.mime_type === 'text/vtt')
    const assigned = captions.find(item => item.caption_for_asset_id === videoId)
    if (assigned) return assigned
    const videos = attachments.filter(item => item.asset_id && item.mime_type === 'video/mp4')
    if (videos.length === 1 && videos[0].asset_id === videoId && captions.length === 1
        && !Object.prototype.hasOwnProperty.call(captions[0], 'caption_for_asset_id')) {
        return captions[0]
    }
    return undefined
}
