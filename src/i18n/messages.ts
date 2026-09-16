import { DEFAULT_LOCALE, type Locale } from './locale'

export interface MessageDictionary {
  siteName: string
  home: string
  homeAriaLabel: string
  interactiveTextbook: string
  courseDirectory: string
  closeCourseDirectory: string
  learningRoute: string
  learningProgress: string
  courseCompletionProgress: string
  courseTags: string
  courseNavigation: string
  courseLearning: string
  lessonContent: string
  lessonBody: string
  teachingNotes: string
  previousLesson: string
  nextLesson: string
  learned: string
  markAsLearned: string
  currentLesson: string
  learnedCurrentLesson: string
  notCompleted: string
  minutes: string
  lessonsCompleted: string
  availableLesson: string
  comingSoon: string
  language: string
  toggleLanguage: string
  simplifiedChinese: string
  englishPreview: string
  toggleTheme: string
  collapseSidebar: string
  expandSidebar: string
}

export const messages: Partial<Record<Locale, MessageDictionary>> = {
  'zh-CN': {
    siteName: '数据仓库图解',
    home: '首页',
    homeAriaLabel: '返回数据仓库图解首页',
    interactiveTextbook: '交互式教材',
    courseDirectory: '课程目录',
    closeCourseDirectory: '关闭课程目录',
    learningRoute: '学习路线',
    learningProgress: '学习进度',
    courseCompletionProgress: '课程完成进度',
    courseTags: '课程标签',
    courseNavigation: '课程导航',
    courseLearning: '课程学习',
    lessonContent: '课程内容',
    lessonBody: '课程正文',
    teachingNotes: '教学旁注',
    previousLesson: '上一节',
    nextLesson: '下一节',
    learned: '已学会',
    markAsLearned: '标记为已学会',
    currentLesson: '当前课程',
    learnedCurrentLesson: '已学会，当前课程',
    notCompleted: '未完成',
    minutes: '分钟',
    lessonsCompleted: '节已完成',
    availableLesson: '可学习',
    comingSoon: '即将开放',
    language: '语言',
    toggleLanguage: '切换语言',
    simplifiedChinese: '简体中文',
    englishPreview: 'English · Preview',
    toggleTheme: '切换浅色 / 深色主题',
    collapseSidebar: '收起目录',
    expandSidebar: '展开目录',
  },
  en: {
    siteName: 'Data Warehouse Visualized',
    home: 'Home',
    homeAriaLabel: 'Return to Data Warehouse Visualized home',
    interactiveTextbook: 'Interactive textbook',
    courseDirectory: 'Course directory',
    closeCourseDirectory: 'Close course directory',
    learningRoute: 'Learning route',
    learningProgress: 'Learning progress',
    courseCompletionProgress: 'Course completion progress',
    courseTags: 'Course tags',
    courseNavigation: 'Course navigation',
    courseLearning: 'Course learning',
    lessonContent: 'Lesson content',
    lessonBody: 'Lesson body',
    teachingNotes: 'Teaching notes',
    previousLesson: 'Previous lesson',
    nextLesson: 'Next lesson',
    learned: 'Completed',
    markAsLearned: 'Mark as completed',
    currentLesson: 'Current lesson',
    learnedCurrentLesson: 'Completed, current lesson',
    notCompleted: 'Not completed',
    minutes: 'min',
    lessonsCompleted: 'lessons completed',
    availableLesson: 'Available',
    comingSoon: 'Coming soon',
    language: 'Language',
    toggleLanguage: 'Switch language',
    simplifiedChinese: 'Simplified Chinese',
    englishPreview: 'English · Preview',
    toggleTheme: 'Switch light / dark theme',
    collapseSidebar: 'Collapse course directory',
    expandSidebar: 'Expand course directory',
  },
}

export type MessageKey = keyof MessageDictionary

export function getMessage(key: MessageKey, locale: Locale = DEFAULT_LOCALE): string {
  return messages[locale]?.[key] ?? messages[DEFAULT_LOCALE]![key]
}
