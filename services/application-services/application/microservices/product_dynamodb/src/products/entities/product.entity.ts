/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 */
export class Product {
  constructor (
    private readonly id: string,
    private readonly price: number,
    private readonly name: string,
    private readonly category: string
  ) {}
}
