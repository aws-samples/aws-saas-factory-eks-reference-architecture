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
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AlertModule } from 'ngx-bootstrap/alert';
import { CommonModule } from '@angular/common';
import { FormModule } from '@coreui/angular';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-create',
  templateUrl: './create.component.html',
  styles: [],
  standalone: true,
  imports: [AlertModule, CommonModule, ReactiveFormsModule, FormModule, RouterLink],
})
export class CreateComponent implements OnInit {
  form: FormGroup;
  submitting = false;
  error = false;
  success = false;

  constructor(private fb: FormBuilder, private http: HttpClient) {
    this.form = this.fb.group({
      tenantName: [null, [Validators.required]],
      email: [null, [Validators.email, Validators.required]],
      companyName: [null, [Validators.required]],
      tier: [null, [Validators.required]],
    });
  }

  ngOnInit(): void {}

  onSubmit() {
    // const API_URL = `${environment.apiUrl}/tenants`;
    const API_URL = `${environment.apiUrl}/tenant-registrations`;
    const domain = environment.domain;

    // const tenant = {
    //   ...this.form.value,
    //   tenantStatus: 'In progress',
    //   customDomain: domain,
    // };
    const tenant = {
      // tenantId: guid(),
      tenantData: {
        ...this.form.value,
      },
      tenantRegistrationData: {
        registrationStatus: "In progress"
      }
    };

    this.submitting = true;
    this.http.post(API_URL, tenant).subscribe({
      complete: () => {
        this.submitting = false;
        this.success = true;
        this.error = false;
      },
      error: (err) => {
        this.submitting = false;
        this.success = false;
        this.error = true;
        console.log(err);
      },
    });
  }

  isFieldInvalid(field: string) {
    const formField = this.form.get(field);
    return formField && formField.invalid && (formField.dirty || formField.touched);
  }

  displayFieldCss(field: string) {
    return {
      'is-invalid': this.isFieldInvalid(field),
    };
  }

  hasRequiredError(field: string) {
    return this.hasError(field, 'required');
  }

  hasError(field: string, error: any) {
    const formField = this.form.get(field);
    return formField && formField.errors && !!formField.errors[error];
  }

  getTenantUrl() {
    const companyName: string = this.form.value.companyName;
    const re = /[\W\s]+/g;
    const tenantId = companyName.replace(re, '').toLowerCase();

    if (environment.usingCustomDomain) {
      return `https://${tenantId}.${environment.domain}/`;
    } else {
      return `https://${environment.domain}/${tenantId}/`;
    }
  }
}
