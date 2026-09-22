import { describe, expect, it } from 'vitest'
import {
  countSearchOccurrences,
  normalizeSearchText,
  normalizeSearchTextWithIndices,
  tokenizeSearchQuery,
} from '../src/features/search/normalize'

/**
 * Normalization contract (#148 P1-B).
 *
 * Phase 1 relies on normalized substring matching, so these rules are the
 * foundation of every acceptance query: case, whitespace, `_`/`-` and
 * punctuation must not change the match set.
 */
describe('搜索归一化（#148 P1-B）', () => {
  it('大小写、空白与标点不敏感', () => {
    expect(normalizeSearchText('SQl')).toBe('sql')
    expect(normalizeSearchText('拉 链 表')).toBe('拉链表')
    expect(normalizeSearchText('（幂等）')).toBe('幂等')
    expect(normalizeSearchText('TXT + FLAG')).toBe('txtflag')
  })

  it('中英混合等价写法归一化后完全相等', () => {
    expect(normalizeSearchText('first_seen')).toBe(normalizeSearchText('first seen'))
    expect(normalizeSearchText('first_seen')).toBe(normalizeSearchText('first-seen'))
    expect(normalizeSearchText('ETL / ELT')).toBe(normalizeSearchText('etl/elt'))
    expect(normalizeSearchText('DWS / ADS')).toBe(normalizeSearchText('dws ads'))
  })

  it('中文按字符保留，不做分词', () => {
    expect(normalizeSearchText('拉链表')).toBe('拉链表')
    expect(normalizeSearchText('数据倾斜')).toBe('数据倾斜')
  })

  it('tokenize 按空白切分、归一化并去重，保留 AND 语义所需的顺序', () => {
    expect(tokenizeSearchQuery('幂等 边界')).toEqual(['幂等', '边界'])
    expect(tokenizeSearchQuery('first seen')).toEqual(['first', 'seen'])
    expect(tokenizeSearchQuery('ETL / ELT')).toEqual(['etl', 'elt'])
    expect(tokenizeSearchQuery(' 幂等   幂等 ')).toEqual(['幂等'])
    expect(tokenizeSearchQuery('拉链表')).toEqual(['拉链表'])
  })

  it('单字符中文是合法 term', () => {
    expect(tokenizeSearchQuery('斜')).toEqual(['斜'])
    expect(tokenizeSearchQuery('幂')).toEqual(['幂'])
  })

  it('空查询、纯空白与纯标点查询得到空 terms', () => {
    expect(tokenizeSearchQuery('')).toEqual([])
    expect(tokenizeSearchQuery('   ')).toEqual([])
    expect(tokenizeSearchQuery('。。。！')).toEqual([])
    expect(tokenizeSearchQuery('_-/')).toEqual([])
  })

  it('带下标的归一化能把位置映射回原文（大小写与标点不丢失）', () => {
    const normalized = normalizeSearchTextWithIndices('A_b C')

    expect(normalized.text).toBe('abc')
    expect(normalized.starts).toEqual([0, 2, 4])
    expect(normalized.ends).toEqual([1, 3, 5])
  })

  it('出现次数按不重叠区间统计', () => {
    expect(countSearchOccurrences('abcabc', 'abc')).toBe(2)
    expect(countSearchOccurrences('aaaa', 'aa')).toBe(2)
    expect(countSearchOccurrences('拉链表拉链表', '拉链表')).toBe(2)
    expect(countSearchOccurrences('abc', 'z')).toBe(0)
  })
})
