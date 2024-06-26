/*
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { Observable, of } from 'rxjs';
import { Product } from '../models/product.interface';
import { ProductService } from '../product.service';
import { PopoverModule } from 'ngx-bootstrap/popover';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list.component.html',
  styles: ['td > a { cursor: pointer; } '],
  standalone: true,
  imports: [CommonModule, PopoverModule, RouterModule],
})
export class ProductListComponent implements OnInit {
  products: Observable<Product[]> = of([]);

  constructor(private productSvc: ProductService, private router: Router) {}

  ngOnInit(): void {
    this.refresh();
  }

  onEdit(product: Product) {
    this.router.navigate(['products', 'edit', product.productId]);
    return false;
  }

  onRemove(product: Product) {
    this.productSvc.delete(product);
    this.refresh();
  }

  onCreate() {
    this.router.navigate(['products', 'create']);
  }

  refresh() {
    this.products = this.productSvc.fetch();
  }
}
