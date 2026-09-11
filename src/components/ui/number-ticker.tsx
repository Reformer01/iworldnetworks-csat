'use client';
import React from 'react';

export function NumberTicker({ value, decimalPlaces = 0 }: { value: number; decimalPlaces?: number }) {
  return <span>{Number(value).toFixed(decimalPlaces)}</span>;
}
